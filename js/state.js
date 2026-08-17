// state.js
//
// The single source of truth described in the architecture: one
// `project` object that both the 2D editor and (from Phase 4 on) the 3D
// renderer read from. Nothing outside this file mutates `project`
// directly — every mutation goes through a method here, and every
// method that changes data calls emitChange() so any subscriber
// (Editor2D's renderer today, HouseRenderer in Phase 4) can react.
//
// This is intentionally the same shape as the JSON the master prompt
// specifies for save/load (Phase 9): { projectVersion, metadata,
// settings, floors, walls, rooms, doors, windows, furniture, materials }.

import { PIXELS_PER_METER, GRID_SIZE_M } from './constants.js';
import { detectRooms, reconcileRooms, splitWallsAtJunctions } from './rooms.js';
import { clampOpeningPosition, projectPointOntoWallIfOnSegment, pointAtPosition } from './openings.js';

let idCounter = 0;
export function generateId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function createEmptyProject() {
  const floorId = generateId('floor');
  return {
    projectVersion: 1,
    metadata: { name: 'Untitled Project', createdAt: new Date().toISOString() },
    settings: { pixelsPerMeter: PIXELS_PER_METER, gridSizeM: GRID_SIZE_M },
    floors: [{ id: floorId, name: 'Lantai 1', elevation: 0 }],
    currentFloorId: floorId,
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    furniture: [],
    materials: {},
  };
}

class HouseState extends EventTarget {
  constructor() {
    super();
    this.project = createEmptyProject();
    this.selection = { type: null, id: null };
  }

  emitChange(detail) {
    this.dispatchEvent(new CustomEvent('change', { detail }));
  }

  // ---- Walls ------------------------------------------------------------

  /** Walls on the currently active floor — this is what the 2D editor draws. */
  getWalls() {
    return this.project.walls.filter((w) => w.floorId === this.project.currentFloorId);
  }

  getWallById(id) {
    return this.project.walls.find((w) => w.id === id) || null;
  }

  addWall(wall) {
    this.project.walls.push(wall);
    this._recomputeRooms();
    this.emitChange({ type: 'wall:add', id: wall.id });
    return wall;
  }

  updateWall(id, patch) {
    const wall = this.getWallById(id);
    if (!wall) return null;
    const geometryChanged = 'start' in patch || 'end' in patch;
    Object.assign(wall, patch);
    if (geometryChanged) {
      this._reclampOpeningsOnWall(id);
    }
    this._recomputeRooms();
    this.emitChange({ type: 'wall:update', id });
    return wall;
  }

  removeWall(id) {
    const idx = this.project.walls.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.project.walls.splice(idx, 1);
    this.project.doors = this.project.doors.filter((d) => d.wallId !== id);
    this.project.windows = this.project.windows.filter((w) => w.wallId !== id);
    if (this.selection.type === 'door' && !this.getDoorById(this.selection.id)) {
      this.selection = { type: null, id: null };
    }
    if (this.selection.type === 'window' && !this.getWindowById(this.selection.id)) {
      this.selection = { type: null, id: null };
    }
    this._recomputeRooms();
    this.emitChange({ type: 'wall:remove', id });
    return true;
  }

  /**
   * Split any wall touched mid-segment by another wall's endpoint (a
   * T-junction) so room detection sees them as connected. Callers invoke
   * this at "commit" points only — finishing a wall chain, releasing a
   * drag — never on every intermediate drag update, so a wall grazing
   * past another mid-drag doesn't flicker-split before the user is done
   * moving it.
   */
  normalizeJunctions() {
    const before = this.project.walls;
    const after = splitWallsAtJunctions(before, generateId);
    if (after.length === before.length) return false; // nothing to normalize

    // Capture world positions before swapping the wall list, so any
    // opening that lived on a wall that just got split can be re-anchored
    // to whichever new half now covers that same world point.
    const doorWorlds = this.project.doors.map((d) => [d, this._openingWorldPoint(d, before)]);
    const windowWorlds = this.project.windows.map((w) => [w, this._openingWorldPoint(w, before)]);

    this.project.walls = after;

    for (const [door, worldPoint] of doorWorlds) {
      if (!this.getWallById(door.wallId)) this._reanchorOpening(door, worldPoint, after);
    }
    for (const [win, worldPoint] of windowWorlds) {
      if (!this.getWallById(win.wallId)) this._reanchorOpening(win, worldPoint, after);
    }

    if (this.selection.type === 'wall' && !this.getWallById(this.selection.id)) {
      this.selection = { type: null, id: null };
    }
    this._recomputeRooms();
    this.emitChange({ type: 'walls:normalize' });
    return true;
  }

  _openingWorldPoint(opening, walls) {
    const wall = walls.find((w) => w.id === opening.wallId);
    if (!wall) return null;
    return pointAtPosition(wall, opening.position);
  }

  /** Re-anchors an orphaned door/window to whichever wall now covers its old world position. */
  _reanchorOpening(opening, worldPoint, walls) {
    if (!worldPoint) return;
    for (const wall of walls) {
      const t = projectPointOntoWallIfOnSegment(worldPoint, wall);
      if (t === null) continue;
      opening.wallId = wall.id;
      opening.position = round2(t);
      const others = this._otherOpeningsOnWall(opening, wall.id);
      const clamped = clampOpeningPosition(wall, opening.width, opening.position, others);
      if (clamped !== null) opening.position = round2(clamped);
      return;
    }
    // No wall covers this point any more (shouldn't happen from a pure
    // split) — getDoors()/getWindows() filter out entries whose wall no
    // longer exists, so leaving wallId as-is just means it stops rendering
    // rather than crashing.
  }

  // ---- Rooms (Phase 2) --------------------------------------------------
  //
  // Rooms are derived data — never mutated directly except for their
  // user-given `name`. Their geometry always comes from _recomputeRooms(),
  // called from inside the wall mutation methods above.

  getRooms() {
    return this.project.rooms.filter((r) => r.floorId === this.project.currentFloorId);
  }

  getRoomById(id) {
    return this.project.rooms.find((r) => r.id === id) || null;
  }

  getSelectedRoom() {
    if (this.selection.type !== 'room') return null;
    return this.getRoomById(this.selection.id);
  }

  renameRoom(id, name) {
    const room = this.getRoomById(id);
    if (!room) return null;
    const trimmed = name.trim();
    if (trimmed.length > 0) room.name = trimmed;
    this.emitChange({ type: 'room:rename', id });
    return room;
  }

  _recomputeRooms() {
    const currentFloorId = this.project.currentFloorId;
    const wallsOnFloor = this.project.walls.filter((w) => w.floorId === currentFloorId);
    const candidates = detectRooms(wallsOnFloor);
    const existingOnFloor = this.project.rooms.filter((r) => r.floorId === currentFloorId);
    const existingOtherFloors = this.project.rooms.filter((r) => r.floorId !== currentFloorId);
    const reconciled = reconcileRooms(existingOnFloor, candidates, currentFloorId, generateId);
    this.project.rooms = [...existingOtherFloors, ...reconciled];

    if (this.selection.type === 'room' && !this.getRoomById(this.selection.id)) {
      this.selection = { type: null, id: null };
    }
  }

  // ---- Doors (Phase 3) ---------------------------------------------

  getDoors() {
    return this.project.doors.filter((d) => {
      const wall = this.getWallById(d.wallId);
      return wall && wall.floorId === this.project.currentFloorId;
    });
  }

  getDoorById(id) {
    return this.project.doors.find((d) => d.id === id) || null;
  }

  getDoorsOnWall(wallId) {
    return this.project.doors.filter((d) => d.wallId === wallId);
  }

  addDoor(door) {
    this.project.doors.push(door);
    this.emitChange({ type: 'door:add', id: door.id });
    return door;
  }

  updateDoor(id, patch) {
    const door = this.getDoorById(id);
    if (!door) return null;
    Object.assign(door, patch);
    if ('position' in patch || 'width' in patch) this._clampSingleOpening(door);
    this.emitChange({ type: 'door:update', id });
    return door;
  }

  removeDoor(id) {
    const idx = this.project.doors.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    this.project.doors.splice(idx, 1);
    this.emitChange({ type: 'door:remove', id });
    return true;
  }

  getSelectedDoor() {
    if (this.selection.type !== 'door') return null;
    return this.getDoorById(this.selection.id);
  }

  // ---- Windows (Phase 3) ------------------------------------------------

  getWindows() {
    return this.project.windows.filter((w) => {
      const wall = this.getWallById(w.wallId);
      return wall && wall.floorId === this.project.currentFloorId;
    });
  }

  getWindowById(id) {
    return this.project.windows.find((w) => w.id === id) || null;
  }

  getWindowsOnWall(wallId) {
    return this.project.windows.filter((w) => w.wallId === wallId);
  }

  addWindow(win) {
    this.project.windows.push(win);
    this.emitChange({ type: 'window:add', id: win.id });
    return win;
  }

  updateWindow(id, patch) {
    const win = this.getWindowById(id);
    if (!win) return null;
    Object.assign(win, patch);
    if ('position' in patch || 'width' in patch) this._clampSingleOpening(win);
    this.emitChange({ type: 'window:update', id });
    return win;
  }

  removeWindow(id) {
    const idx = this.project.windows.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.project.windows.splice(idx, 1);
    this.emitChange({ type: 'window:remove', id });
    return true;
  }

  getSelectedWindow() {
    if (this.selection.type !== 'window') return null;
    return this.getWindowById(this.selection.id);
  }

  // ---- Opening placement helpers (shared by doors + windows) -----------

  _otherOpeningsOnWall(opening, wallId) {
    const doors = this.project.doors.filter((d) => d.wallId === wallId && d.id !== opening.id);
    const windows = this.project.windows.filter((w) => w.wallId === wallId && w.id !== opening.id);
    return [...doors, ...windows];
  }

  /** Re-validates one opening's position/width against its own wall + siblings after a direct edit. */
  _clampSingleOpening(opening) {
    const wall = this.getWallById(opening.wallId);
    if (!wall) return;
    const others = this._otherOpeningsOnWall(opening, opening.wallId);
    const clamped = clampOpeningPosition(wall, opening.width, opening.position, others);
    if (clamped !== null) opening.position = round2(clamped);
  }

  /** Re-validates every opening on a wall after that wall's own geometry changed. */
  _reclampOpeningsOnWall(wallId) {
    const wall = this.getWallById(wallId);
    if (!wall) return;
    const openings = [...this.project.doors, ...this.project.windows]
      .filter((o) => o.wallId === wallId)
      .sort((a, b) => a.position - b.position);

    const settled = [];
    for (const opening of openings) {
      const clamped = clampOpeningPosition(wall, opening.width, opening.position, settled);
      if (clamped !== null) opening.position = round2(clamped);
      settled.push(opening);
    }
  }

  // ---- Selection ----------------------------------------------------

  setSelection(type, id) {
    if (this.selection.type === type && this.selection.id === id) return;
    this.selection = { type, id };
    this.emitChange({ type: 'selection:change' });
  }

  clearSelection() {
    this.setSelection(null, null);
  }

  getSelectedWall() {
    if (this.selection.type !== 'wall') return null;
    return this.getWallById(this.selection.id);
  }

  // ---- Project lifecycle ------------------------------------------------

  newProject() {
    this.project = createEmptyProject();
    this.selection = { type: null, id: null };
    this.emitChange({ type: 'project:new' });
  }

  isEmpty() {
    return (
      this.project.walls.length === 0 &&
      this.project.rooms.length === 0 &&
      this.project.doors.length === 0 &&
      this.project.windows.length === 0 &&
      this.project.furniture.length === 0
    );
  }
}

export const houseState = new HouseState();
