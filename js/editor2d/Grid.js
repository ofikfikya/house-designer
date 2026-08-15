// editor2d/Grid.js
//
// Two responsibilities that are naturally paired: drawing the background
// grid, and resolving snap points against that grid / against existing
// walls. WallEditor (drawing) and Selection (dragging endpoints) both
// import resolveSnap from here so there is exactly one snapping
// implementation in the app.

import {
  GRID_SIZE_M,
  GRID_MAJOR_EVERY,
  COLORS,
  SNAP_PIXEL_THRESHOLD,
  GRID_SNAP_PIXEL_THRESHOLD,
  ANGLE_SNAP_STEP_DEG,
  ANGLE_SNAP_TOLERANCE_DEG,
} from '../constants.js';

// ---------------------------------------------------------------------
// Pure geometry helpers (no canvas/DOM access — safe to unit test)
// ---------------------------------------------------------------------

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  return distance(p, closest);
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function roundPoint(p) {
  return { x: round2(p.x), y: round2(p.y) };
}

export function snapToGridPoint(worldPoint, gridSizeM = GRID_SIZE_M) {
  return {
    x: Math.round(worldPoint.x / gridSizeM) * gridSizeM,
    y: Math.round(worldPoint.y / gridSizeM) * gridSizeM,
  };
}

/**
 * Lock (anchor -> point) to the nearest ANGLE_SNAP_STEP_DEG increment if
 * it is within tolerance. Returns { snapped, point } — point is the
 * original point unchanged when nothing snapped.
 */
export function applyAngleSnap(anchor, point) {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { snapped: false, point };
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nearestStep = Math.round(angleDeg / ANGLE_SNAP_STEP_DEG) * ANGLE_SNAP_STEP_DEG;
  const diff = Math.abs(((angleDeg - nearestStep + 540) % 360) - 180);
  if (diff <= ANGLE_SNAP_TOLERANCE_DEG) {
    const rad = (nearestStep * Math.PI) / 180;
    return {
      snapped: true,
      point: { x: anchor.x + Math.cos(rad) * len, y: anchor.y + Math.sin(rad) * len },
    };
  }
  return { snapped: false, point };
}

/**
 * Resolve a raw world point into a snapped point. Priority order:
 *   1. Existing wall endpoints (exact — connectivity matters for future
 *      room detection, so an endpoint match is returned as-is, never
 *      nudged by angle-snap afterwards).
 *   2. Existing wall midpoints (exact, same reasoning).
 *   3. Angle lock relative to `anchorPoint`, when drawing/dragging from
 *      a known start point.
 *   4. Background grid.
 * Falls through to the raw point when nothing is close enough.
 */
export function resolveSnap(rawWorldPoint, viewport, options = {}) {
  const { walls = [], excludeWallId = null, anchorPoint = null } = options;
  const scale = viewport.scale;
  const snapWorldThreshold = SNAP_PIXEL_THRESHOLD / scale;
  const gridWorldThreshold = GRID_SNAP_PIXEL_THRESHOLD / scale;

  let best = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    if (wall.id === excludeWallId) continue;
    for (const key of ['start', 'end']) {
      const pt = wall[key];
      const d = distance(rawWorldPoint, pt);
      if (d < snapWorldThreshold && d < bestDist) {
        bestDist = d;
        best = { point: { x: pt.x, y: pt.y }, type: 'endpoint', wallId: wall.id };
      }
    }
  }

  if (!best) {
    for (const wall of walls) {
      if (wall.id === excludeWallId) continue;
      const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const d = distance(rawWorldPoint, mid);
      if (d < snapWorldThreshold && d < bestDist) {
        bestDist = d;
        best = { point: mid, type: 'midpoint', wallId: wall.id };
      }
    }
  }

  if (best) return best;

  if (anchorPoint) {
    const angled = applyAngleSnap(anchorPoint, rawWorldPoint);
    if (angled.snapped) {
      return { point: angled.point, type: 'angle' };
    }
  }

  const gridPoint = snapToGridPoint(rawWorldPoint);
  if (distance(rawWorldPoint, gridPoint) < gridWorldThreshold) {
    return { point: gridPoint, type: 'grid' };
  }

  return { point: rawWorldPoint, type: 'none' };
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

export function drawGrid(ctx, viewport, canvasWidth, canvasHeight) {
  const scale = viewport.scale;
  const topLeft = viewport.screenToWorld({ x: 0, y: 0 });
  const bottomRight = viewport.screenToWorld({ x: canvasWidth, y: canvasHeight });

  ctx.save();
  ctx.fillStyle = COLORS.canvasBg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const minorSpacingPx = scale * GRID_SIZE_M;
  const showMinor = minorSpacingPx > 7;

  const startX = Math.floor(topLeft.x / GRID_SIZE_M) - 1;
  const endX = Math.ceil(bottomRight.x / GRID_SIZE_M) + 1;
  const startY = Math.floor(topLeft.y / GRID_SIZE_M) - 1;
  const endY = Math.ceil(bottomRight.y / GRID_SIZE_M) + 1;

  ctx.lineWidth = 1;

  if (showMinor) {
    ctx.strokeStyle = COLORS.gridMinor;
    ctx.beginPath();
    for (let gx = startX; gx <= endX; gx++) {
      if (gx % GRID_MAJOR_EVERY === 0) continue;
      const sx = Math.round(viewport.worldToScreen({ x: gx * GRID_SIZE_M, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasHeight);
    }
    for (let gy = startY; gy <= endY; gy++) {
      if (gy % GRID_MAJOR_EVERY === 0) continue;
      const sy = Math.round(viewport.worldToScreen({ x: 0, y: gy * GRID_SIZE_M }).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasWidth, sy);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.gridMajor;
  ctx.beginPath();
  for (let gx = startX; gx <= endX; gx++) {
    if (gx % GRID_MAJOR_EVERY !== 0) continue;
    const sx = Math.round(viewport.worldToScreen({ x: gx * GRID_SIZE_M, y: 0 }).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvasHeight);
  }
  for (let gy = startY; gy <= endY; gy++) {
    if (gy % GRID_MAJOR_EVERY !== 0) continue;
    const sy = Math.round(viewport.worldToScreen({ x: 0, y: gy * GRID_SIZE_M }).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(canvasWidth, sy);
  }
  ctx.stroke();

  const origin = viewport.worldToScreen({ x: 0, y: 0 });
  ctx.strokeStyle = COLORS.gridAxis;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(origin.y) + 0.5);
  ctx.lineTo(canvasWidth, Math.round(origin.y) + 0.5);
  ctx.moveTo(Math.round(origin.x) + 0.5, 0);
  ctx.lineTo(Math.round(origin.x) + 0.5, canvasHeight);
  ctx.stroke();

  ctx.restore();
}

/** Small orange dot + halo marking where a point snapped — shared by WallEditor and Selection. */
export function drawSnapIndicator(ctx, screenPoint) {
  ctx.save();
  ctx.fillStyle = COLORS.snapIndicatorRing;
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.snapIndicator;
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
