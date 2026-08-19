// objects/windows.js

import { openingEdgePoints } from '../openings.js';
import { WINDOW_FRAME_TRIM_M, WINDOW_GLASS_THICKNESS_RATIO } from '../constants.js';

export const WINDOW_DEFAULTS = Object.freeze({ width: 1.2, height: 1.2, sillHeight: 0.9 });
export const MIN_WINDOW_WIDTH_M = 0.3;
export const MAX_WINDOW_WIDTH_M = 3.0;
export const MIN_WINDOW_HEIGHT_M = 0.3;
export const MAX_WINDOW_HEIGHT_M = 2.5;
export const MIN_SILL_HEIGHT_M = 0;
export const MAX_SILL_HEIGHT_M = 2.0;

export const WINDOW_COLORS = Object.freeze({
  glass: 'rgba(147, 197, 253, 0.45)',
  glassSelected: 'rgba(59, 109, 240, 0.35)',
  frame: '#3b6db0',
  frameSelected: '#1c3fb8',
});

export function createWindow(id, wallId, position) {
  return {
    id,
    wallId,
    position,
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    sillHeight: WINDOW_DEFAULTS.sillHeight,
  };
}

/**
 * Plain box parameters (world meters) for a window's 3D representation:
 * a glass pane positioned vertically by `sillHeight` (this is the field's
 * first real payoff — the 2D plan is top-down, so sill height had no
 * visual effect there) plus a frame (two jambs, a head, and a sill trim).
 */
export function getWindowMesh3DParams(wall, win) {
  const { edgeStart, edgeEnd, center } = openingEdgePoints(wall, win);
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const rotationY = -Math.atan2(dy, dx);

  const trim = Math.min(WINDOW_FRAME_TRIM_M, win.width / 4);
  const glassCenterY = win.sillHeight + win.height / 2;
  const glassDepth = Math.max(wall.thickness * WINDOW_GLASS_THICKNESS_RATIO, 0.02);

  const glass = {
    width: Math.max(win.width - trim, 0.15),
    height: Math.max(win.height - trim, 0.15),
    depth: glassDepth,
    position: { x: center.x, y: glassCenterY, z: center.y },
    rotationY,
  };

  const jambOffset = win.width / 2 - trim / 2;
  const frame = [
    {
      width: trim,
      height: win.height + trim,
      depth: wall.thickness,
      position: { x: center.x - ux * jambOffset, y: glassCenterY, z: center.y - uy * jambOffset },
      rotationY,
    },
    {
      width: trim,
      height: win.height + trim,
      depth: wall.thickness,
      position: { x: center.x + ux * jambOffset, y: glassCenterY, z: center.y + uy * jambOffset },
      rotationY,
    },
    {
      width: win.width,
      height: trim,
      depth: wall.thickness,
      position: { x: center.x, y: win.sillHeight + win.height + trim / 2, z: center.y },
      rotationY,
    },
    {
      width: win.width,
      height: trim,
      depth: wall.thickness,
      position: { x: center.x, y: win.sillHeight - trim / 2, z: center.y },
      rotationY,
    },
  ];

  return { glass, frame };
}

/**
 * Draw a window's glazed panel inside its already-cut wall gap. All
 * points passed in are SCREEN space; `thicknessPx` is the wall's screen
 * thickness so the glazing fills the same footprint the wall did.
 */
export function drawWindow2D(ctx, { edgeStart, edgeEnd, thicknessPx, isSelected, isHovered }) {
  const dir = normalize({ x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y });
  const perp = { x: -dir.y, y: dir.x };
  const half = thicknessPx / 2;

  const corners = [
    { x: edgeStart.x + perp.x * half, y: edgeStart.y + perp.y * half },
    { x: edgeEnd.x + perp.x * half, y: edgeEnd.y + perp.y * half },
    { x: edgeEnd.x - perp.x * half, y: edgeEnd.y - perp.y * half },
    { x: edgeStart.x - perp.x * half, y: edgeStart.y - perp.y * half },
  ];

  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = isSelected ? WINDOW_COLORS.glassSelected : WINDOW_COLORS.glass;
  ctx.fill();
  ctx.strokeStyle = isSelected ? WINDOW_COLORS.frameSelected : WINDOW_COLORS.frame;
  ctx.lineWidth = isHovered || isSelected ? 2 : 1.5;
  ctx.stroke();

  // Center mullion, perpendicular to the wall, splitting the pane visually.
  const mid = { x: (edgeStart.x + edgeEnd.x) / 2, y: (edgeStart.y + edgeEnd.y) / 2 };
  ctx.beginPath();
  ctx.moveTo(mid.x + perp.x * half, mid.y + perp.y * half);
  ctx.lineTo(mid.x - perp.x * half, mid.y - perp.y * half);
  ctx.stroke();
  ctx.restore();
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}
