// editor2d/Selection.js
//
// Implements the SELECT tool: hit-testing walls (and, for the currently
// selected wall, its two endpoint handles), hover feedback, drag-to-move
// / drag-handle-to-resize (both snap-aware, reusing Grid's resolveSnap),
// delete, and the dimension-line annotation shown on the selected wall.

import { distanceToSegment, resolveSnap, roundPoint, drawSnapIndicator } from './Grid.js';
import { HIT_TOLERANCE_PX, ENDPOINT_HANDLE_RADIUS_PX, ENDPOINT_HANDLE_HIT_RADIUS_PX, COLORS } from '../constants.js';
import { houseState } from '../state.js';

const DRAG_THRESHOLD_PX = 4;

export class Selection {
  constructor(viewport) {
    this.viewport = viewport;
    this.dragState = null;
    this.hoveredWallId = null;
    this.lastSnap = null;
  }

  hitTestWall(screenPoint, wall) {
    const a = this.viewport.worldToScreen(wall.start);
    const b = this.viewport.worldToScreen(wall.end);
    const halfThicknessPx = Math.max((wall.thickness * this.viewport.scale) / 2, 2);
    const d = distanceToSegment(screenPoint, a, b);
    return d <= halfThicknessPx + HIT_TOLERANCE_PX;
  }

  findWallAt(screenPoint) {
    const walls = houseState.getWalls();
    for (let i = walls.length - 1; i >= 0; i--) {
      if (this.hitTestWall(screenPoint, walls[i])) return walls[i];
    }
    return null;
  }

  getHandleAt(screenPoint, wall) {
    const a = this.viewport.worldToScreen(wall.start);
    const b = this.viewport.worldToScreen(wall.end);
    if (Math.hypot(screenPoint.x - a.x, screenPoint.y - a.y) <= ENDPOINT_HANDLE_HIT_RADIUS_PX) return 'start';
    if (Math.hypot(screenPoint.x - b.x, screenPoint.y - b.y) <= ENDPOINT_HANDLE_HIT_RADIUS_PX) return 'end';
    return null;
  }

  /** Returns true if the pointer hit something (wall or handle) and a drag may have started. */
  onPointerDown(screenPoint) {
    const selectedWall = houseState.getSelectedWall();

    if (selectedWall) {
      const handle = this.getHandleAt(screenPoint, selectedWall);
      if (handle) {
        this.dragState = {
          mode: 'endpoint',
          handle,
          wallId: selectedWall.id,
          originalStart: { ...selectedWall.start },
          originalEnd: { ...selectedWall.end },
          startScreen: screenPoint,
          moved: false,
        };
        return true;
      }
    }

    const wall = this.findWallAt(screenPoint);
    if (wall) {
      houseState.setSelection('wall', wall.id);
      this.dragState = {
        mode: 'move',
        wallId: wall.id,
        originalStart: { ...wall.start },
        originalEnd: { ...wall.end },
        startWorld: this.viewport.screenToWorld(screenPoint),
        startScreen: screenPoint,
        moved: false,
      };
      return true;
    }

    houseState.clearSelection();
    this.dragState = null;
    return false;
  }

  onPointerMove(screenPoint) {
    if (this.dragState) {
      this._continueDrag(screenPoint);
      return;
    }
    const hovered = this.findWallAt(screenPoint);
    this.hoveredWallId = hovered ? hovered.id : null;
  }

  _continueDrag(screenPoint) {
    const dxScreen = screenPoint.x - this.dragState.startScreen.x;
    const dyScreen = screenPoint.y - this.dragState.startScreen.y;
    if (!this.dragState.moved && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD_PX) return;
    this.dragState.moved = true;

    const wall = houseState.getWallById(this.dragState.wallId);
    if (!wall) return;

    if (this.dragState.mode === 'endpoint') {
      const raw = this.viewport.screenToWorld(screenPoint);
      const anchor = this.dragState.handle === 'start' ? this.dragState.originalEnd : this.dragState.originalStart;
      const snap = resolveSnap(raw, this.viewport, {
        walls: houseState.getWalls(),
        excludeWallId: wall.id,
        anchorPoint: anchor,
      });
      this.lastSnap = snap;
      const patch =
        this.dragState.handle === 'start' ? { start: roundPoint(snap.point) } : { end: roundPoint(snap.point) };
      houseState.updateWall(wall.id, patch);
    } else if (this.dragState.mode === 'move') {
      const currentWorld = this.viewport.screenToWorld(screenPoint);
      const dx = currentWorld.x - this.dragState.startWorld.x;
      const dy = currentWorld.y - this.dragState.startWorld.y;
      const rawStart = { x: this.dragState.originalStart.x + dx, y: this.dragState.originalStart.y + dy };
      const rawEnd = { x: this.dragState.originalEnd.x + dx, y: this.dragState.originalEnd.y + dy };
      const snapStart = resolveSnap(rawStart, this.viewport, {
        walls: houseState.getWalls(),
        excludeWallId: wall.id,
      });
      const snapDelta = { x: snapStart.point.x - rawStart.x, y: snapStart.point.y - rawStart.y };
      this.lastSnap = snapStart;
      houseState.updateWall(wall.id, {
        start: roundPoint(snapStart.point),
        end: roundPoint({ x: rawEnd.x + snapDelta.x, y: rawEnd.y + snapDelta.y }),
      });
    }
  }

  onPointerUp() {
    this.lastSnap = null;
    this.dragState = null;
  }

  deleteSelected() {
    const sel = houseState.selection;
    if (sel.type === 'wall' && sel.id) {
      houseState.removeWall(sel.id);
      houseState.clearSelection();
      return true;
    }
    return false;
  }

  draw(ctx) {
    if (this.hoveredWallId && this.hoveredWallId !== houseState.selection.id) {
      const hoveredWall = houseState.getWallById(this.hoveredWallId);
      if (hoveredWall) this._drawHoverOutline(ctx, hoveredWall);
    }

    const wall = houseState.getSelectedWall();
    if (!wall) return;

    const a = this.viewport.worldToScreen(wall.start);
    const b = this.viewport.worldToScreen(wall.end);
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
    const perp = { x: -dir.y, y: dir.x };
    const halfT = Math.max((wall.thickness * this.viewport.scale) / 2, 2) + 4;

    ctx.save();
    ctx.strokeStyle = COLORS.wallSelectedStroke;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x + perp.x * halfT, a.y + perp.y * halfT);
    ctx.lineTo(b.x + perp.x * halfT, b.y + perp.y * halfT);
    ctx.moveTo(a.x - perp.x * halfT, a.y - perp.y * halfT);
    ctx.lineTo(b.x - perp.x * halfT, b.y - perp.y * halfT);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, ENDPOINT_HANDLE_RADIUS_PX, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.handleFill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.handleStroke;
      ctx.stroke();
    }
    ctx.restore();

    this._drawDimension(ctx, wall, a, b);

    if (this.lastSnap && this.lastSnap.type !== 'none') {
      drawSnapIndicator(ctx, this.viewport.worldToScreen(this.lastSnap.point));
    }
  }

  _drawHoverOutline(ctx, wall) {
    const a = this.viewport.worldToScreen(wall.start);
    const b = this.viewport.worldToScreen(wall.end);
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
    const perp = { x: -dir.y, y: dir.x };
    const halfT = Math.max((wall.thickness * this.viewport.scale) / 2, 2) + 3;

    ctx.save();
    ctx.strokeStyle = COLORS.wallHoverStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x + perp.x * halfT, a.y + perp.y * halfT);
    ctx.lineTo(b.x + perp.x * halfT, b.y + perp.y * halfT);
    ctx.moveTo(a.x - perp.x * halfT, a.y - perp.y * halfT);
    ctx.lineTo(b.x - perp.x * halfT, b.y - perp.y * halfT);
    ctx.stroke();
    ctx.restore();
  }

  _drawDimension(ctx, wall, a, b) {
    const lengthM = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
    const perp = { x: -dir.y, y: dir.x };
    const offset = 28;
    const oa = { x: a.x + perp.x * offset, y: a.y + perp.y * offset };
    const ob = { x: b.x + perp.x * offset, y: b.y + perp.y * offset };
    const extA = { x: a.x + perp.x * (offset - 6), y: a.y + perp.y * (offset - 6) };
    const extB = { x: b.x + perp.x * (offset - 6), y: b.y + perp.y * (offset - 6) };

    ctx.save();
    ctx.strokeStyle = COLORS.dimensionLine;
    ctx.fillStyle = COLORS.dimensionLine;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(extA.x, extA.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(extB.x, extB.y);
    ctx.moveTo(oa.x, oa.y);
    ctx.lineTo(ob.x, ob.y);
    ctx.stroke();

    drawArrowHead(ctx, oa, ob, COLORS.dimensionLine);
    drawArrowHead(ctx, ob, oa, COLORS.dimensionLine);

    const mid = { x: (oa.x + ob.x) / 2, y: (oa.y + ob.y) / 2 };
    const label = `${lengthM.toFixed(2)} m`;
    ctx.font = '600 12px ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mid.x - textWidth / 2 - 5, mid.y - 19, textWidth + 10, 17);
    ctx.strokeRect(mid.x - textWidth / 2 - 5, mid.y - 19, textWidth + 10, 17);
    ctx.fillStyle = COLORS.dimensionText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mid.x, mid.y - 10.5);
    ctx.restore();
  }
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function drawArrowHead(ctx, tip, from, color) {
  const dir = normalize({ x: tip.x - from.x, y: tip.y - from.y });
  const size = 6;
  const angle = Math.atan2(dir.y, dir.x);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(angle - Math.PI / 7), tip.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(tip.x - size * Math.cos(angle + Math.PI / 7), tip.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
