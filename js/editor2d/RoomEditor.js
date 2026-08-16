// editor2d/RoomEditor.js
//
// Rooms are detected automatically (state.js recomputes them on every
// wall change) — there is no "draw a room" gesture. This tool is about
// *selecting* an already-detected room (to rename it via the Properties
// Panel) independently of wall selection, which is why it's a separate
// tool from SELECT rather than folded into it: clicking inside a room
// near one of its walls would otherwise be ambiguous about whether you
// meant the wall or the room.

import { pointInPolygon, polygonCentroid } from '../rooms.js';
import { houseState } from '../state.js';
import { COLORS } from '../constants.js';

export class RoomEditor {
  constructor(viewport) {
    this.viewport = viewport;
    this.hoveredRoomId = null;
  }

  findRoomAt(screenPoint) {
    const worldPoint = this.viewport.screenToWorld(screenPoint);
    const rooms = houseState.getRooms();
    for (let i = rooms.length - 1; i >= 0; i--) {
      if (pointInPolygon(worldPoint, rooms[i].points)) return rooms[i];
    }
    return null;
  }

  onPointerDown(screenPoint) {
    const room = this.findRoomAt(screenPoint);
    if (room) {
      houseState.setSelection('room', room.id);
      return true;
    }
    houseState.clearSelection();
    return false;
  }

  onPointerMove(screenPoint) {
    const room = this.findRoomAt(screenPoint);
    this.hoveredRoomId = room ? room.id : null;
  }

  onPointerUp() {
    // No drag behavior for rooms — geometry only changes via their bounding walls.
  }

  /** Room fills + name/area labels are always visible, drawn under the walls. */
  drawFillsAndLabels(ctx) {
    const rooms = houseState.getRooms();
    const selectedId = houseState.selection.type === 'room' ? houseState.selection.id : null;
    for (const room of rooms) {
      this._drawFill(ctx, room, room.id === selectedId, room.id === this.hoveredRoomId);
    }
  }

  _drawFill(ctx, room, isSelected, isHovered) {
    const screenPoints = room.points.map((p) => this.viewport.worldToScreen(p));

    ctx.save();
    ctx.beginPath();
    screenPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = isSelected ? COLORS.roomFillSelected : isHovered ? COLORS.roomFillHover : COLORS.roomFill;
    ctx.fill();
    if (isSelected) {
      ctx.strokeStyle = COLORS.roomStrokeSelected;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    this._drawLabel(ctx, room);
  }

  _drawLabel(ctx, room) {
    const centroid = polygonCentroid(room.points);
    const p = this.viewport.worldToScreen(centroid);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = COLORS.roomLabelName;
    ctx.fillText(room.name, p.x, p.y - 8);

    ctx.font = '600 11px ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = COLORS.roomLabelArea;
    ctx.fillText(`${room.area.toFixed(2)} m\u00b2`, p.x, p.y + 9);
    ctx.restore();
  }
}
