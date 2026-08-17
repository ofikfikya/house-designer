// objects/windows.js

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
