// editor2d/WallEditor.js
//
// Implements the WALL tool. A click sets an anchor point; the next click
// commits a wall from that anchor to the (snapped) clicked point, then
// immediately continues the chain from that new endpoint — so drawing a
// room's four walls is click-click-click-click-Escape rather than
// repeating the whole two-click gesture for every single segment.

import { resolveSnap, distance, round2, drawSnapIndicator } from './Grid.js';
import { COLORS, DEFAULT_WALL_THICKNESS_M, DEFAULT_WALL_HEIGHT_M, MIN_WALL_LENGTH_M } from '../constants.js';
import { houseState, generateId } from '../state.js';

export class WallEditor {
  constructor(viewport) {
    this.viewport = viewport;
    this.anchor = null; // world point the current chain continues from
    this.previewPoint = null; // last resolved (snapped) world point under the cursor
    this.lastSnap = null;
  }

  get isDrawing() {
    return this.anchor !== null;
  }

  handlePointerMove(screenPoint) {
    const raw = this.viewport.screenToWorld(screenPoint);
    const snap = resolveSnap(raw, this.viewport, {
      walls: houseState.getWalls(),
      anchorPoint: this.anchor,
    });
    this.previewPoint = snap.point;
    this.lastSnap = snap;
  }

  handlePointerDown(screenPoint) {
    const raw = this.viewport.screenToWorld(screenPoint);
    const snap = resolveSnap(raw, this.viewport, {
      walls: houseState.getWalls(),
      anchorPoint: this.anchor,
    });
    const point = snap.point;

    if (!this.anchor) {
      this.anchor = point;
      this.previewPoint = point;
      return;
    }

    if (distance(this.anchor, point) < MIN_WALL_LENGTH_M) {
      // Too short to be a real wall — ignore the click, keep drawing from the same anchor.
      return;
    }

    const wall = {
      id: generateId('wall'),
      floorId: houseState.project.currentFloorId,
      start: { x: round2(this.anchor.x), y: round2(this.anchor.y) },
      end: { x: round2(point.x), y: round2(point.y) },
      thickness: DEFAULT_WALL_THICKNESS_M,
      height: DEFAULT_WALL_HEIGHT_M,
    };
    houseState.addWall(wall);
    houseState.setSelection('wall', wall.id);

    // Continue the chain from this wall's endpoint.
    this.anchor = wall.end;
    this.previewPoint = wall.end;
  }

  /** Escape, or switching tools, ends the current chain without committing a segment. */
  cancel() {
    this.anchor = null;
    this.previewPoint = null;
    this.lastSnap = null;
  }

  draw(ctx) {
    if (!this.anchor || !this.previewPoint) return;

    const a = this.viewport.worldToScreen(this.anchor);
    const b = this.viewport.worldToScreen(this.previewPoint);

    ctx.save();
    ctx.strokeStyle = COLORS.wallPreviewStroke;
    ctx.lineWidth = Math.max(DEFAULT_WALL_THICKNESS_M * this.viewport.scale, 2);
    ctx.lineCap = 'round';
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.wallPreviewStroke;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
    ctx.fill();

    const lengthM = distance(this.anchor, this.previewPoint);
    const label = `${lengthM.toFixed(2)} m`;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.font = '600 12px ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mid.x - textWidth / 2 - 5, mid.y - 25, textWidth + 10, 17);
    ctx.strokeStyle = COLORS.wallPreviewStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(mid.x - textWidth / 2 - 5, mid.y - 25, textWidth + 10, 17);
    ctx.fillStyle = COLORS.wallPreviewStroke;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mid.x, mid.y - 16.5);
    ctx.restore();

    if (this.lastSnap && this.lastSnap.type !== 'none') {
      drawSnapIndicator(ctx, b);
    }
  }
}
