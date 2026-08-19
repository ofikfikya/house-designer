// objects/doors.js

import { openingEdgePoints } from '../openings.js';
import { DOOR_FRAME_TRIM_M, DOOR_LEAF_THICKNESS_M } from '../constants.js';

export const DOOR_DEFAULTS = Object.freeze({ width: 0.9, height: 2.1 });
export const MIN_DOOR_WIDTH_M = 0.4;
export const MAX_DOOR_WIDTH_M = 2.4;
export const MIN_DOOR_HEIGHT_M = 0.4;
export const MAX_DOOR_HEIGHT_M = 3.0;

export const DOOR_COLORS = Object.freeze({
  leaf: '#8a5a2b',
  leafSelected: '#1c3fb8',
  arc: 'rgba(138, 90, 43, 0.55)',
  arcSelected: 'rgba(28, 63, 184, 0.6)',
  sliding: '#8a5a2b',
  slidingSelected: '#1c3fb8',
});

export function createDoor(id, wallId, position) {
  return {
    id,
    wallId,
    position,
    width: DOOR_DEFAULTS.width,
    height: DOOR_DEFAULTS.height,
    rotation: 0, // 0/90/180/270 — which corner of the opening is the hinge, and which side it swings to
    swingType: 'swing', // 'swing' | 'sliding'
  };
}

export function nextRotation(rotation) {
  return (rotation + 90) % 360;
}

/**
 * Plain box parameters (world meters) for a door's 3D representation: a
 * leaf filling the opening (shown closed, regardless of the 2D swing
 * `rotation` — see Scene3D module notes) plus a simple frame (two jambs
 * + a head). Reuses openingEdgePoints so the 3D opening lines up with
 * the exact same gap the 2D wall segments already cut.
 */
export function getDoorMesh3DParams(wall, door) {
  const { edgeStart, edgeEnd, center } = openingEdgePoints(wall, door);
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y; // 2D "y" maps to 3D "z" throughout the app
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const rotationY = -Math.atan2(dy, dx);

  const trim = Math.min(DOOR_FRAME_TRIM_M, door.width / 4);
  const leaf = {
    width: Math.max(door.width - trim, 0.2),
    height: door.height,
    depth: DOOR_LEAF_THICKNESS_M,
    position: { x: center.x, y: door.height / 2, z: center.y },
    rotationY,
  };

  const jambOffset = door.width / 2 - trim / 2;
  const frame = [
    {
      width: trim,
      height: door.height,
      depth: wall.thickness,
      position: { x: center.x - ux * jambOffset, y: door.height / 2, z: center.y - uy * jambOffset },
      rotationY,
    },
    {
      width: trim,
      height: door.height,
      depth: wall.thickness,
      position: { x: center.x + ux * jambOffset, y: door.height / 2, z: center.y + uy * jambOffset },
      rotationY,
    },
    {
      width: door.width,
      height: trim,
      depth: wall.thickness,
      position: { x: center.x, y: door.height + trim / 2, z: center.y },
      rotationY,
    },
  ];

  return { leaf, frame };
}

/**
 * Draw a door's leaf + swing arc (or sliding indicator) inside its
 * already-cut wall gap. All points passed in are SCREEN space.
 */
export function drawDoor2D(ctx, { edgeStart, edgeEnd, door, isSelected, isHovered }) {
  const leafColor = isSelected ? DOOR_COLORS.leafSelected : DOOR_COLORS.leaf;
  const arcColor = isSelected ? DOOR_COLORS.arcSelected : DOOR_COLORS.arc;

  if (door.swingType === 'sliding') {
    drawSlidingDoor(ctx, edgeStart, edgeEnd, isSelected);
    return;
  }

  const useStartAsHinge = door.rotation === 0 || door.rotation === 90;
  const swingPositive = door.rotation === 0 || door.rotation === 180;

  const hinge = useStartAsHinge ? edgeStart : edgeEnd;
  const closedTip = useStartAsHinge ? edgeEnd : edgeStart;
  const radius = Math.hypot(closedTip.x - hinge.x, closedTip.y - hinge.y);

  const along = normalize({ x: closedTip.x - hinge.x, y: closedTip.y - hinge.y });
  const perp = swingPositive ? { x: -along.y, y: along.x } : { x: along.y, y: -along.x };
  const openTip = { x: hinge.x + perp.x * radius, y: hinge.y + perp.y * radius };

  ctx.save();
  ctx.strokeStyle = arcColor;
  ctx.lineWidth = isHovered || isSelected ? 1.5 : 1;
  ctx.setLineDash([3, 3]);
  drawArcBetween(ctx, hinge, closedTip, openTip, radius);
  ctx.setLineDash([]);

  ctx.strokeStyle = leafColor;
  ctx.lineWidth = isSelected ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.lineTo(openTip.x, openTip.y);
  ctx.stroke();
  ctx.restore();
}

function drawSlidingDoor(ctx, edgeStart, edgeEnd, isSelected) {
  const color = isSelected ? DOOR_COLORS.slidingSelected : DOOR_COLORS.sliding;
  const mid = { x: (edgeStart.x + edgeEnd.x) / 2, y: (edgeStart.y + edgeEnd.y) / 2 };
  const toEnd = normalize({ x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y });
  const panelStart = { x: mid.x, y: mid.y };
  const panelEnd = { x: edgeEnd.x, y: edgeEnd.y };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = isSelected ? 3 : 2.5;
  ctx.beginPath();
  ctx.moveTo(panelStart.x, panelStart.y);
  ctx.lineTo(panelEnd.x, panelEnd.y);
  ctx.stroke();

  // Small arrow hinting at the slide direction.
  const arrowTip = { x: edgeStart.x + toEnd.x * 6, y: edgeStart.y + toEnd.y * 6 };
  const perp = { x: -toEnd.y, y: toEnd.x };
  ctx.beginPath();
  ctx.moveTo(edgeStart.x, edgeStart.y);
  ctx.lineTo(arrowTip.x + perp.x * 4, arrowTip.y + perp.y * 4);
  ctx.moveTo(edgeStart.x, edgeStart.y);
  ctx.lineTo(arrowTip.x - perp.x * 4, arrowTip.y - perp.y * 4);
  ctx.stroke();
  ctx.restore();
}

/** Sample points along the (always exactly 90deg, by construction) short arc from closedTip to openTip around hinge. */
function drawArcBetween(ctx, hinge, closedTip, openTip, radius) {
  const angleClosed = Math.atan2(closedTip.y - hinge.y, closedTip.x - hinge.x);
  const angleOpen = Math.atan2(openTip.y - hinge.y, openTip.x - hinge.x);
  let diff = angleOpen - angleClosed;
  diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;

  const steps = 16;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = angleClosed + (diff * i) / steps;
    const x = hinge.x + Math.cos(a) * radius;
    const y = hinge.y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}
