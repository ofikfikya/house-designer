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

let idCounter = 0;
export function generateId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
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
    Object.assign(wall, patch);
    this._recomputeRooms();
    this.emitChange({ type: 'wall:update', id });
    return wall;
  }

  removeWall(id) {
    const idx = this.project.walls.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.project.walls.splice(idx, 1);
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

    this.project.walls = after;
    if (this.selection.type === 'wall' && !this.getWallById(this.selection.id)) {
      this.selection = { type: null, id: null };
    }
    this._recomputeRooms();
    this.emitChange({ type: 'walls:normalize' });
    return true;
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
