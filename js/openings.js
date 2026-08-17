// openings.js
//
// Doors and windows are structurally the same thing — an "opening" that
// lives on a wall at a given distance from that wall's start, with a
// width — so the placement/validation math lives here once and is
// shared. What differs between them (default size, 2D symbol, the extra
// door-only rotation/swingType or window-only sillHeight fields) stays in
// js/objects/doors.js and js/objects/windows.js.

export const OPENING_EDGE_MARGIN_M = 0.05; // min gap from the wall's own ends
export const OPENING_GAP_MARGIN_M = 0.03; // min gap between two adjacent openings
export const OPENING_REANCHOR_TOLERANCE_M = 0.03; // how far off a wall's line/span still counts as "on it" after a split

function wallLength(wall) {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

export function wallDirection(wall) {
  const len = wallLength(wall) || 1;
  return { x: (wall.end.x - wall.start.x) / len, y: (wall.end.y - wall.start.y) / len };
}

/** World point at distance `position` from wall.start, along the wall. */
export function pointAtPosition(wall, position) {
  const dir = wallDirection(wall);
  return { x: wall.start.x + dir.x * position, y: wall.start.y + dir.y * position };
}

/** Project an arbitrary world point onto the wall's line, clamped to [0, wallLength]. */
export function projectPointOntoWall(point, wall) {
  const length = wallLength(wall);
  if (length < 1e-9) return 0;
  const dir = wallDirection(wall);
  const t = (point.x - wall.start.x) * dir.x + (point.y - wall.start.y) * dir.y;
  return Math.max(0, Math.min(length, t));
}

/**
 * Like projectPointOntoWall, but returns null if the point isn't actually
 * ON the wall's segment (within tolerance) — used to re-anchor an
 * opening to whichever new wall half now covers its world position after
 * a T-junction split.
 */
export function projectPointOntoWallIfOnSegment(point, wall, tolerance = OPENING_REANCHOR_TOLERANCE_M) {
  const length = wallLength(wall);
  if (length < 1e-9) return null;
  const dir = wallDirection(wall);
  const apx = point.x - wall.start.x;
  const apy = point.y - wall.start.y;
  const t = apx * dir.x + apy * dir.y;
  if (t < -tolerance || t > length + tolerance) return null;
  const cross = Math.abs(dir.x * apy - dir.y * apx);
  if (cross > tolerance) return null;
  return Math.max(0, Math.min(length, t));
}

/**
 * Find the valid position (distance-from-start of the opening's CENTER)
 * closest to `desiredPosition` for an opening of `width` on `wall`,
 * given `otherOpenings` already on that same wall. Returns null only
 * when there truly is no room anywhere on the wall for this width.
 */
export function clampOpeningPosition(wall, width, desiredPosition, otherOpenings) {
  const length = wallLength(wall);
  const half = width / 2;
  const rangeLo = OPENING_EDGE_MARGIN_M + half;
  const rangeHi = length - OPENING_EDGE_MARGIN_M - half;
  if (rangeLo > rangeHi) return null;

  const blocked = otherOpenings
    .map((o) => [
      o.position - o.width / 2 - OPENING_GAP_MARGIN_M - half,
      o.position + o.width / 2 + OPENING_GAP_MARGIN_M + half,
    ])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [lo, hi] of blocked) {
    if (merged.length > 0 && lo <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], hi);
    } else {
      merged.push([lo, hi]);
    }
  }

  const free = [];
  let cursor = rangeLo;
  for (const [bLo, bHi] of merged) {
    if (bLo > cursor) free.push([cursor, Math.min(bLo, rangeHi)]);
    cursor = Math.max(cursor, bHi);
    if (cursor >= rangeHi) break;
  }
  if (cursor < rangeHi) free.push([cursor, rangeHi]);

  const validFree = free.filter(([lo, hi]) => hi >= lo);
  if (validFree.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const [lo, hi] of validFree) {
    const clamped = Math.min(hi, Math.max(lo, desiredPosition));
    const dist = Math.abs(clamped - desiredPosition);
    if (dist < bestDist) {
      bestDist = dist;
      best = clamped;
    }
  }
  return best;
}

/**
 * The solid wall sub-segments to actually render, given a wall and the
 * openings on it (each opening cuts a gap of its own width, centered on
 * its position). Returns an array of { start, end } world points.
 */
export function computeWallSolidSegments(wall, openingsOnWall) {
  const length = wallLength(wall);
  const sorted = [...openingsOnWall].sort((a, b) => a.position - b.position);

  const segments = [];
  let cursor = 0;
  for (const o of sorted) {
    const gapStart = Math.max(0, o.position - o.width / 2);
    const gapEnd = Math.min(length, o.position + o.width / 2);
    if (gapStart > cursor) {
      segments.push({ start: pointAtPosition(wall, cursor), end: pointAtPosition(wall, gapStart) });
    }
    cursor = Math.max(cursor, gapEnd);
  }
  if (cursor < length) {
    segments.push({ start: pointAtPosition(wall, cursor), end: pointAtPosition(wall, length) });
  }
  return segments;
}

/** The two along-wall edge points of an opening (for drawing gaps/frames/arcs). */
export function openingEdgePoints(wall, opening) {
  const dir = wallDirection(wall);
  const half = opening.width / 2;
  const center = pointAtPosition(wall, opening.position);
  return {
    edgeStart: { x: center.x - dir.x * half, y: center.y - dir.y * half },
    edgeEnd: { x: center.x + dir.x * half, y: center.y + dir.y * half },
    center,
  };
}
