// editor2d/OpeningEditor.js
//
// Implements both the DOOR and WINDOW tools. They're the same tool logic
// parametrized by `kind`: click an empty spot on a wall to place a new
// opening there (clamped to a valid, non-overlapping position), click an
// existing opening of this tool's kind to select it, drag to slide it
// along its wall. What differs between doors and windows — default size,
// the 2D symbol — comes from objects/doors.js / objects/windows.js.
//
// Placed openings render unconditionally (drawSymbols, called from
// Editor2D's main pass, like walls) since once placed they're part of
// the permanent plan; hover/selection/preview only update while this
// tool is the active one.

import { distanceToSegment, round2 } from './Grid.js';
import { clampOpeningPosition, projectPointOntoWall, openingEdgePoints, pointAtPosition } from '../openings.js';
import { createDoor, drawDoor2D, DOOR_DEFAULTS } from '../objects/doors.js';
import { createWindow, drawWindow2D, WINDOW_DEFAULTS } from '../objects/windows.js';
import { houseState, generateId } from '../state.js';
import { COLORS, HIT_TOLERANCE_PX } from '../constants.js';

const DRAG_THRESHOLD_PX = 4;

export class OpeningEditor {
  constructor(viewport, kind) {
    this.viewport = viewport;
    this.kind = kind; // 'door' | 'window'
    this.hoveredId = null;
    this.dragState = null;
    this.previewPosition = null; // { wallId, rawPosition, position, valid }
  }

  get isDoor() {
    return this.kind === 'door';
  }

  // ---- Kind-agnostic access to the right slice of state -----------------

  _getAll() {
    return this.isDoor ? houseState.getDoors() : houseState.getWindows();
  }
  _getById(id) {
    return this.isDoor ? houseState.getDoorById(id) : houseState.getWindowById(id);
  }
  _getOnWall(wallId) {
    return this.isDoor ? houseState.getDoorsOnWall(wallId) : houseState.getWindowsOnWall(wallId);
  }
  _add(obj) {
    return this.isDoor ? houseState.addDoor(obj) : houseState.addWindow(obj);
  }
  _update(id, patch) {
    return this.isDoor ? houseState.updateDoor(id, patch) : houseState.updateWindow(id, patch);
  }
  _remove(id) {
    return this.isDoor ? houseState.removeDoor(id) : houseState.removeWindow(id);
  }
  _defaultWidth() {
    return this.isDoor ? DOOR_DEFAULTS.width : WINDOW_DEFAULTS.width;
  }

  // ---- Hit-testing --------------------------------------------------

  findWallAt(screenPoint) {
    const walls = houseState.getWalls();
    for (let i = walls.length - 1; i >= 0; i--) {
      const wall = walls[i];
      const a = this.viewport.worldToScreen(wall.start);
      const b = this.viewport.worldToScreen(wall.end);
      const halfThicknessPx = Math.max((wall.thickness * this.viewport.scale) / 2, 2);
      if (distanceToSegment(screenPoint, a, b) <= halfThicknessPx + HIT_TOLERANCE_PX) return wall;
    }
    return null;
  }

  findOpeningAt(screenPoint) {
    const all = this._getAll();
    for (let i = all.length - 1; i >= 0; i--) {
      const opening = all[i];
      const wall = houseState.getWallById(opening.wallId);
      if (!wall) continue;
      const { edgeStart, edgeEnd } = openingEdgePoints(wall, opening);
      const a = this.viewport.worldToScreen(edgeStart);
      const b = this.viewport.worldToScreen(edgeEnd);
      const halfThicknessPx = Math.max((wall.thickness * this.viewport.scale) / 2, 4);
      if (distanceToSegment(screenPoint, a, b) <= halfThicknessPx + HIT_TOLERANCE_PX) return opening;
    }
    return null;
  }

  // ---- Interaction ----------------------------------------------------

  onPointerDown(screenPoint) {
    const existing = this.findOpeningAt(screenPoint);
    if (existing) {
      houseState.setSelection(this.kind, existing.id);
      this.dragState = { id: existing.id, startScreen: screenPoint, moved: false };
      return true;
    }

    const wall = this.findWallAt(screenPoint);
    if (!wall) {
      houseState.clearSelection();
      return false;
    }

    const worldPoint = this.viewport.screenToWorld(screenPoint);
    const desiredPosition = projectPointOntoWall(worldPoint, wall);
    const width = this._defaultWidth();
    const others = this._getOnWall(wall.id);
    const clamped = clampOpeningPosition(wall, width, desiredPosition, others);
    if (clamped === null) return false; // no room for a new opening on this wall

    const opening = this.isDoor
      ? createDoor(generateId('door'), wall.id, round2(clamped))
      : createWindow(generateId('window'), wall.id, round2(clamped));
    this._add(opening);
    houseState.setSelection(this.kind, opening.id);
    return true;
  }

  onPointerMove(screenPoint) {
    if (this.dragState) {
      this._continueDrag(screenPoint);
      return;
    }

    const hovered = this.findOpeningAt(screenPoint);
    this.hoveredId = hovered ? hovered.id : null;

    if (hovered) {
      this.previewPosition = null;
      return;
    }

    const wall = this.findWallAt(screenPoint);
    if (!wall) {
      this.previewPosition = null;
      return;
    }
    const worldPoint = this.viewport.screenToWorld(screenPoint);
    const desiredPosition = projectPointOntoWall(worldPoint, wall);
    const others = this._getOnWall(wall.id);
    const clamped = clampOpeningPosition(wall, this._defaultWidth(), desiredPosition, others);
    this.previewPosition = { wallId: wall.id, rawPosition: desiredPosition, position: clamped, valid: clamped !== null };
  }

  _continueDrag(screenPoint) {
    const dx = screenPoint.x - this.dragState.startScreen.x;
    const dy = screenPoint.y - this.dragState.startScreen.y;
    if (!this.dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    this.dragState.moved = true;

    const opening = this._getById(this.dragState.id);
    if (!opening) return;
    const wall = houseState.getWallById(opening.wallId);
    if (!wall) return;

    const worldPoint = this.viewport.screenToWorld(screenPoint);
    const desiredPosition = projectPointOntoWall(worldPoint, wall);
    this._update(opening.id, { position: round2(desiredPosition) }); // state.js clamps this internally
  }

  onPointerUp() {
    this.dragState = null;
  }

  deleteSelected() {
    const sel = houseState.selection;
    if (sel.type === this.kind && sel.id) {
      this._remove(sel.id);
      houseState.clearSelection();
      return true;
    }
    return false;
  }

  // ---- Rendering ------------------------------------------------------

  /** Always-visible: the actual placed doors/windows of this kind, drawn like walls are. */
  drawSymbols(ctx) {
    const all = this._getAll();
    const selectedId = houseState.selection.type === this.kind ? houseState.selection.id : null;

    for (const opening of all) {
      const wall = houseState.getWallById(opening.wallId);
      if (!wall) continue;
      const { edgeStart, edgeEnd } = openingEdgePoints(wall, opening);
      const a = this.viewport.worldToScreen(edgeStart);
      const b = this.viewport.worldToScreen(edgeEnd);
      const isSelected = opening.id === selectedId;
      const isHovered = opening.id === this.hoveredId;

      if (this.isDoor) {
        drawDoor2D(ctx, { edgeStart: a, edgeEnd: b, door: opening, isSelected, isHovered });
      } else {
        const thicknessPx = Math.max(wall.thickness * this.viewport.scale, 3);
        drawWindow2D(ctx, { edgeStart: a, edgeEnd: b, thicknessPx, isSelected, isHovered });
      }

      if (isSelected) this._drawWidthLabel(ctx, opening, a, b);
    }
  }

  /** Tool-only: ghost preview of where the next opening would land, or an invalid marker. */
  drawPreview(ctx) {
    if (this.dragState || !this.previewPosition) return;
    const wall = houseState.getWallById(this.previewPosition.wallId);
    if (!wall) return;

    if (!this.previewPosition.valid) {
      const worldPoint = pointAtPosition(wall, this.previewPosition.rawPosition);
      const p = this.viewport.worldToScreen(worldPoint);
      const r = 7;
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const ghost = { position: this.previewPosition.position, width: this._defaultWidth() };
    const { edgeStart, edgeEnd } = openingEdgePoints(wall, ghost);
    const a = this.viewport.worldToScreen(edgeStart);
    const b = this.viewport.worldToScreen(edgeEnd);

    ctx.save();
    ctx.globalAlpha = 0.55;
    if (this.isDoor) {
      drawDoor2D(ctx, {
        edgeStart: a,
        edgeEnd: b,
        door: { ...ghost, rotation: 0, swingType: 'swing' },
        isSelected: false,
        isHovered: false,
      });
    } else {
      const thicknessPx = Math.max(wall.thickness * this.viewport.scale, 3);
      drawWindow2D(ctx, { edgeStart: a, edgeEnd: b, thicknessPx, isSelected: false, isHovered: false });
    }
    ctx.restore();
  }

  _drawWidthLabel(ctx, opening, a, b) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const label = `${opening.width.toFixed(2)} m`;
    ctx.save();
    ctx.font = '600 11px ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mid.x - textWidth / 2 - 4, mid.y - 27, textWidth + 8, 15);
    ctx.strokeStyle = COLORS.dimensionLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(mid.x - textWidth / 2 - 4, mid.y - 27, textWidth + 8, 15);
    ctx.fillStyle = COLORS.dimensionText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mid.x, mid.y - 19.5);
    ctx.restore();
  }
}
