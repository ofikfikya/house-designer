// rooms.js
//
// Phase 2: turning a set of walls into rooms. Two separate concerns live
// here on purpose:
//
//   1. detectRooms(walls) is a PURE function with no notion of "this room
//      existed before" — given the current walls, it traces every
//      enclosed region of the planar graph they form and returns fresh
//      candidate polygons. Run it twice with the same walls, get the
//      same answer.
//
//   2. reconcileRooms(existingRooms, candidates) is what gives rooms a
//      stable identity across edits, so renaming "Kamar Tidur" and then
//      nudging a wall doesn't reset it back to "Room 1". A candidate is
//      matched to an existing room by how much its boundary wall set
//      overlaps an existing room's — geometry (points/area) can drift a
//      little as walls move, but which walls bound the room changes much
//      less often.
//
// state.js calls both of these from inside addWall/updateWall/removeWall
// so room detection is part of the same atomic operation as the wall
// change, rather than a separate reactive step that could re-trigger
// itself.

export const MIN_ROOM_AREA_M2 = 0.05;

// ---------------------------------------------------------------------
// Polygon math (pure)
// ---------------------------------------------------------------------

/** Signed shoelace area. Sign indicates winding direction — see detectRooms. */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonCentroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    const n = points.length || 1;
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: sx / n, y: sy / n };
  }
  area /= 2;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Standard ray-casting point-in-polygon test. */
export function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function nodeKey(p) {
  return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
}

// ---------------------------------------------------------------------
// T-junction normalization
// ---------------------------------------------------------------------
//
// detectRooms only sees a connection between two walls when they share an
// EXACT endpoint. The most common way a T-junction actually gets drawn,
// though, is: draw one long outer wall, then draw a divider whose end
// touches that outer wall's *middle* — geometrically touching, but not
// topologically connected (the outer wall has no vertex there). Without
// splitting the outer wall at that point, room detection would silently
// fail to see the two resulting rooms, which would make the headline
// feature of this phase unreliable in the most ordinary case. So: before
// detecting rooms, any wall whose interior is touched by another wall's
// endpoint gets split into two walls at that point.

const JUNCTION_LINE_TOLERANCE_M = 0.02; // how far off the infinite line still counts as "on it"
const JUNCTION_MIN_EDGE_DISTANCE_M = 0.05; // how close to an existing endpoint still counts as "already shared", not a T-junction

function pointOnSegmentInterior(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = Math.hypot(abx, aby);
  if (length < 1e-6) return false;

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const cross = abx * apy - aby * apx;
  const distToLine = Math.abs(cross) / length;
  if (distToLine > JUNCTION_LINE_TOLERANCE_M) return false;

  const t = (apx * abx + apy * aby) / (length * length);
  if (t <= 0 || t >= 1) return false;

  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  const distFromA = Math.hypot(projX - a.x, projY - a.y);
  const distFromB = Math.hypot(projX - b.x, projY - b.y);
  return distFromA > JUNCTION_MIN_EDGE_DISTANCE_M && distFromB > JUNCTION_MIN_EDGE_DISTANCE_M;
}

/**
 * Split any wall whose interior is touched by another wall's endpoint,
 * so the two become properly connected at a shared vertex. Idempotent —
 * running it again on its own output is a no-op — so callers don't need
 * to worry about double-splitting.
 */
export function splitWallsAtJunctions(walls, generateId) {
  let current = walls.map((w) => ({ ...w, start: { ...w.start }, end: { ...w.end } }));
  let changed = true;
  let iterations = 0;
  const maxIterations = current.length + 8;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    findSplit: for (const candidate of current) {
      for (const other of current) {
        if (other.id === candidate.id) continue;
        for (const key of ['start', 'end']) {
          const p = other[key];
          if (pointOnSegmentInterior(p, candidate.start, candidate.end)) {
            const splitPoint = { x: p.x, y: p.y };
            const half1 = { ...candidate, id: generateId('wall'), end: splitPoint };
            const half2 = { ...candidate, id: generateId('wall'), start: splitPoint };
            current = current.filter((w) => w.id !== candidate.id).concat([half1, half2]);
            changed = true;
            break findSplit;
          }
        }
      }
    }
  }

  return current;
}

// ---------------------------------------------------------------------
// Room detection — planar graph face tracing
// ---------------------------------------------------------------------

/**
 * Trace every enclosed region formed by `walls` (a planar straight-line
 * graph: nodes are wall endpoints, edges are walls — this relies on
 * connected walls sharing EXACT coordinates, which the 2D editor's
 * snapping already guarantees).
 *
 * Method: represent each wall as two directed "darts" (start->end and
 * end->start). At the arrival node of a dart, the next dart in the same
 * face is the one immediately clockwise from the direction we arrived
 * from — the classic "always turn as sharply right as possible" face
 * trace. Every dart belongs to exactly one face this way. Bounded rooms
 * come out with one consistent winding sign; the outer, unbounded
 * face(s) come out with the opposite sign, which is what lets us discard
 * them (verified by the test suite, not just asserted).
 */
export function detectRooms(walls) {
  if (walls.length === 0) return [];

  const dartsByNode = new Map();

  function addDart(from, to, wallId) {
    const fromKey = nodeKey(from);
    const toKey = nodeKey(to);
    const dart = {
      fromKey,
      from: { x: from.x, y: from.y },
      toKey,
      to: { x: to.x, y: to.y },
      angle: Math.atan2(to.y - from.y, to.x - from.x),
      wallId,
      dartId: `${fromKey}=>${toKey}|${wallId}`,
    };
    if (!dartsByNode.has(fromKey)) dartsByNode.set(fromKey, []);
    dartsByNode.get(fromKey).push(dart);
  }

  for (const wall of walls) {
    addDart(wall.start, wall.end, wall.id);
    addDart(wall.end, wall.start, wall.id);
  }

  for (const list of dartsByNode.values()) {
    list.sort((a, b) => a.angle - b.angle);
  }

  const dartById = new Map();
  const indexInNode = new Map();
  for (const list of dartsByNode.values()) {
    list.forEach((d, idx) => {
      dartById.set(d.dartId, d);
      indexInNode.set(d.dartId, idx);
    });
  }

  function nextInFace(dart) {
    const reverse = dartById.get(`${dart.toKey}=>${dart.fromKey}|${dart.wallId}`);
    const list = dartsByNode.get(dart.toKey);
    const idx = indexInNode.get(reverse.dartId);
    const n = list.length;
    return list[(idx - 1 + n) % n];
  }

  const visited = new Set();
  const faces = [];
  const maxSteps = walls.length * 2 + 4;

  for (const list of dartsByNode.values()) {
    for (const startDart of list) {
      if (visited.has(startDart.dartId)) continue;

      const points = [];
      const wallIds = [];
      let current = startDart;
      let guard = 0;
      let closed = false;

      do {
        visited.add(current.dartId);
        points.push(current.from);
        wallIds.push(current.wallId);
        current = nextInFace(current);
        guard++;
        if (current.dartId === startDart.dartId) {
          closed = true;
          break;
        }
      } while (guard < maxSteps);

      if (closed) {
        faces.push({ points, wallIds, area: polygonArea(points) });
      }
    }
  }

  return faces
    .filter((f) => f.points.length >= 3 && f.area > MIN_ROOM_AREA_M2)
    .map((f) => ({
      points: f.points,
      area: round2(f.area),
      wallIds: [...new Set(f.wallIds)],
    }));
}

// ---------------------------------------------------------------------
// Reconciliation — give detected candidates a stable identity
// ---------------------------------------------------------------------

/**
 * Match freshly-detected room candidates against the previous room list
 * so names and ids survive small edits. A candidate is matched to an
 * existing room when their boundary wall sets overlap by at least 50%
 * (Jaccard similarity) — the best-overlapping, not-yet-claimed existing
 * room wins. Unmatched candidates become new rooms with an auto-generated
 * "Room N" name; existing rooms that match nothing are dropped (their
 * walls no longer enclose that space).
 */
export function reconcileRooms(existingRooms, candidates, currentFloorId, generateId) {
  const usedExistingIds = new Set();
  const usedNames = new Set(existingRooms.map((r) => r.name));
  let counter = 1;

  function nextDefaultName() {
    while (usedNames.has(`Room ${counter}`)) counter++;
    const name = `Room ${counter}`;
    usedNames.add(name);
    return name;
  }

  const result = [];

  for (const candidate of candidates) {
    const candidateSet = new Set(candidate.wallIds);
    let bestMatch = null;
    let bestScore = 0;

    for (const existing of existingRooms) {
      if (usedExistingIds.has(existing.id) || existing.floorId !== currentFloorId) continue;
      const existingSet = new Set(existing.wallIds || []);
      const intersection = [...candidateSet].filter((id) => existingSet.has(id)).length;
      const union = new Set([...candidateSet, ...existingSet]).size;
      const score = union === 0 ? 0 : intersection / union;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = existing;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      usedExistingIds.add(bestMatch.id);
      result.push({
        ...bestMatch,
        points: candidate.points,
        area: candidate.area,
        wallIds: candidate.wallIds,
      });
    } else {
      result.push({
        id: generateId('room'),
        floorId: currentFloorId,
        name: nextDefaultName(),
        points: candidate.points,
        area: candidate.area,
        wallIds: candidate.wallIds,
      });
    }
  }

  return result;
}
