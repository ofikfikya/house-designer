// editor2d/Viewport.js
//
// Owns the 2D camera state (zoom + pan) and converts between world space
// (meters, origin at the project's 0,0) and screen space (CSS pixels on
// the canvas). Kept separate from Editor2D so the transform math can be
// reasoned about — and unit-tested — on its own.
//
// This is a small, deliberate addition to the folder structure described
// in the master prompt (section 4 allows simplifying the structure for a
// first version as long as the architecture stays modular). Coordinate
// transform logic is a distinct responsibility from event routing and
// rendering orchestration, which is what Editor2D handles.

import { PIXELS_PER_METER, MIN_ZOOM, MAX_ZOOM } from '../constants.js';

export class Viewport {
  constructor() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  get scale() {
    return PIXELS_PER_METER * this.zoom;
  }

  worldToScreen(point) {
    const s = this.scale;
    return {
      x: point.x * s + this.panX,
      y: point.y * s + this.panY,
    };
  }

  screenToWorld(point) {
    const s = this.scale;
    return {
      x: (point.x - this.panX) / s,
      y: (point.y - this.panY) / s,
    };
  }

  panBy(dx, dy) {
    this.panX += dx;
    this.panY += dy;
  }

  /** Zoom while keeping the world point under (screenX, screenY) fixed on screen. */
  zoomAt(screenX, screenY, factor) {
    const worldBefore = this.screenToWorld({ x: screenX, y: screenY });
    const newZoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === this.zoom) return;
    this.zoom = newZoom;
    const screenAfter = this.worldToScreen(worldBefore);
    this.panX += screenX - screenAfter.x;
    this.panY += screenY - screenAfter.y;
  }

  centerOn(worldX, worldY, canvasWidth, canvasHeight) {
    const s = this.scale;
    this.panX = canvasWidth / 2 - worldX * s;
    this.panY = canvasHeight / 2 - worldY * s;
  }

  reset(canvasWidth, canvasHeight) {
    this.zoom = 1;
    this.centerOn(0, 0, canvasWidth, canvasHeight);
  }
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
