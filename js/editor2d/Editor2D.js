// editor2d/Editor2D.js
//
// Orchestrates the 2D canvas: owns the Viewport (zoom/pan), the active
// tool, and routes pointer/wheel/keyboard input to WallEditor or
// Selection depending on that tool. Renders are event-driven (a dirty
// flag coalesced through requestAnimationFrame) rather than a free-running
// loop, per the performance guidance in the brief.
//
// Input uses the Pointer Events API (not separate mouse/touch handlers)
// so a single code path drives mouse, touch, and pen. Two simultaneous
// pointers are treated as a pinch/pan gesture; a single pointer is
// routed to whichever tool is active.

import { Viewport, clamp } from './Viewport.js';
import { WallEditor } from './WallEditor.js';
import { Selection } from './Selection.js';
import { drawGrid } from './Grid.js';
import { houseState } from '../state.js';
import { TOOLS, COLORS, ZOOM_SENSITIVITY, MIN_ZOOM, MAX_ZOOM, PIXELS_PER_METER } from '../constants.js';

export class Editor2D extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = new Viewport();
    this.wallEditor = new WallEditor(this.viewport);
    this.selection = new Selection(this.viewport);

    this.activeTool = TOOLS.SELECT;
    this.isPanning = false;
    this.isSpaceDown = false;
    this.panStart = null;
    this.activePointers = new Map(); // pointerId -> {x, y} in client coords
    this._pinch = null;
    this.lastMouseWorld = null;

    this._dirty = true;
    this._rafScheduled = false;

    this._bindEvents();

    this._resize();
    this.viewport.reset(this._cssWidth, this._cssHeight);

    this._resizeObserver = new ResizeObserver(() => {
      this._resize();
      this.requestRender();
    });
    this._resizeObserver.observe(this.canvas);

    houseState.addEventListener('change', () => this.requestRender());

    this.requestRender();
  }

  // ---- Public API ---------------------------------------------------

  setTool(tool) {
    if (this.activeTool === tool) return;
    this.wallEditor.cancel();
    this.selection.onPointerUp();
    this.selection.hoveredWallId = null;
    houseState.clearSelection();
    this.activeTool = tool;
    this.canvas.style.cursor = tool === TOOLS.WALL ? 'crosshair' : 'default';
    this.dispatchEvent(new CustomEvent('toolchange', { detail: { tool } }));
    this.requestRender();
  }

  resetCameraToFit() {
    this.viewport.reset(this._cssWidth, this._cssHeight);
    this.requestRender();
  }

  zoomIn() {
    this.viewport.zoomAt(this._cssWidth / 2, this._cssHeight / 2, 1.25);
    this.requestRender();
  }

  zoomOut() {
    this.viewport.zoomAt(this._cssWidth / 2, this._cssHeight / 2, 1 / 1.25);
    this.requestRender();
  }

  requestRender() {
    this._dirty = true;
    if (!this._rafScheduled) {
      this._rafScheduled = true;
      requestAnimationFrame(() => this._frame());
    }
  }

  // ---- Rendering ------------------------------------------------------

  _frame() {
    this._rafScheduled = false;
    if (!this._dirty) return;
    this._dirty = false;
    this._render();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._cssWidth = width;
    this._cssHeight = height;
  }

  _render() {
    const ctx = this.ctx;
    const w = this._cssWidth;
    const h = this._cssHeight;

    drawGrid(ctx, this.viewport, w, h);
    this._drawWalls(ctx);

    if (this.activeTool === TOOLS.WALL) {
      this.wallEditor.draw(ctx);
    } else if (this.activeTool === TOOLS.SELECT) {
      this.selection.draw(ctx);
    }

    this._emitStatus();
  }

  _drawWalls(ctx) {
    const walls = houseState.getWalls();
    const selectedId = houseState.selection.type === 'wall' ? houseState.selection.id : null;
    for (const wall of walls) {
      if (wall.id === selectedId) continue; // drawn last so its highlight sits on top
      this._drawWall(ctx, wall, false);
    }
    if (selectedId) {
      const selWall = houseState.getWallById(selectedId);
      if (selWall) this._drawWall(ctx, selWall, true);
    }
  }

  _drawWall(ctx, wall, isSelected) {
    const a = this.viewport.worldToScreen(wall.start);
    const b = this.viewport.worldToScreen(wall.end);
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
    const perp = { x: -dir.y, y: dir.x };
    const halfT = Math.max((wall.thickness * this.viewport.scale) / 2, 1.5);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x + perp.x * halfT, a.y + perp.y * halfT);
    ctx.lineTo(b.x + perp.x * halfT, b.y + perp.y * halfT);
    ctx.lineTo(b.x - perp.x * halfT, b.y - perp.y * halfT);
    ctx.lineTo(a.x - perp.x * halfT, a.y - perp.y * halfT);
    ctx.closePath();
    ctx.fillStyle = isSelected ? COLORS.wallSelectedFill : COLORS.wallFill;
    ctx.fill();
    ctx.strokeStyle = isSelected ? COLORS.wallSelectedStroke : COLORS.wallStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  _emitStatus() {
    const selected = houseState.getSelectedWall();
    const floor = houseState.project.floors.find((f) => f.id === houseState.project.currentFloorId);

    let lengthLabel = '\u2014';
    if (this.activeTool === TOOLS.WALL && this.wallEditor.isDrawing && this.wallEditor.previewPoint) {
      const d = Math.hypot(
        this.wallEditor.previewPoint.x - this.wallEditor.anchor.x,
        this.wallEditor.previewPoint.y - this.wallEditor.anchor.y
      );
      lengthLabel = `${d.toFixed(2)} m`;
    } else if (selected) {
      const d = Math.hypot(selected.end.x - selected.start.x, selected.end.y - selected.start.y);
      lengthLabel = `${d.toFixed(2)} m`;
    }

    this.dispatchEvent(
      new CustomEvent('status', {
        detail: {
          floorName: floor ? floor.name : '\u2014',
          cursor: this.lastMouseWorld ? `${this.lastMouseWorld.x.toFixed(2)}m, ${this.lastMouseWorld.y.toFixed(2)}m` : '\u2014',
          length: lengthLabel,
          zoomPercent: Math.round(this.viewport.zoom * 100),
        },
      })
    );
  }

  // ---- Events -----------------------------------------------------------

  _bindEvents() {
    const canvas = this.canvas;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  _screenPointFromClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button === 2) return; // right-click: ignored (menu already suppressed)
    e.preventDefault();

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size >= 2) {
      this._beginPinch();
      return;
    }

    const isMiddleButton = e.pointerType === 'mouse' && e.button === 1;
    const isPrimary = e.pointerType !== 'mouse' || e.button === 0;

    if (isMiddleButton || (isPrimary && this.isSpaceDown)) {
      this._beginPan(e.clientX, e.clientY);
      return;
    }
    if (!isPrimary) return;

    const p = this._screenPointFromClient(e.clientX, e.clientY);

    if (this.activeTool === TOOLS.WALL) {
      this.wallEditor.handlePointerDown(p);
      this.requestRender();
    } else if (this.activeTool === TOOLS.SELECT) {
      const hit = this.selection.onPointerDown(p);
      if (!hit) this._beginPan(e.clientX, e.clientY);
      this.requestRender();
    }
  }

  _onPointerMove(e) {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this._pinch && this.activePointers.size >= 2) {
      this._updatePinch();
      return;
    }

    const p = this._screenPointFromClient(e.clientX, e.clientY);
    this.lastMouseWorld = this.viewport.screenToWorld(p);

    if (this.isPanning && this.panStart) {
      this.viewport.panX = this.panStart.panX + (e.clientX - this.panStart.x);
      this.viewport.panY = this.panStart.panY + (e.clientY - this.panStart.y);
      this.requestRender();
      return;
    }

    if (this.activeTool === TOOLS.WALL) {
      this.wallEditor.handlePointerMove(p);
      this.requestRender();
    } else if (this.activeTool === TOOLS.SELECT) {
      this.selection.onPointerMove(p);
      this._updateSelectCursor(p);
      this.requestRender();
    }
  }

  _onPointerUp(e) {
    this.activePointers.delete(e.pointerId);

    if (this._pinch && this.activePointers.size < 2) {
      this._pinch = null;
    }

    if (this.activePointers.size === 0) {
      if (this.isPanning) {
        this.isPanning = false;
        this.panStart = null;
        this.canvas.style.cursor = this.isSpaceDown ? 'grab' : this.activeTool === TOOLS.WALL ? 'crosshair' : 'default';
        return;
      }
      if (this.activeTool === TOOLS.SELECT) {
        this.selection.onPointerUp();
        this.requestRender();
      }
    }
  }

  _updateSelectCursor(p) {
    if (this.isPanning) return;
    const selectedWall = houseState.getSelectedWall();
    if (this.selection.dragState) {
      this.canvas.style.cursor = this.selection.dragState.mode === 'endpoint' ? 'grabbing' : 'move';
    } else if (selectedWall && this.selection.getHandleAt(p, selectedWall)) {
      this.canvas.style.cursor = 'grab';
    } else if (this.selection.hoveredWallId) {
      this.canvas.style.cursor = 'pointer';
    } else {
      this.canvas.style.cursor = 'default';
    }
  }

  _beginPan(clientX, clientY) {
    this.wallEditor.cancel();
    this.isPanning = true;
    this.panStart = { x: clientX, y: clientY, panX: this.viewport.panX, panY: this.viewport.panY };
    this.canvas.style.cursor = 'grabbing';
  }

  _beginPinch() {
    this.isPanning = false;
    this.wallEditor.cancel();
    this.selection.onPointerUp();
    const pts = [...this.activePointers.values()];
    const [p1, p2] = pts;
    this._pinch = {
      startDistance: Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), 1),
      startZoom: this.viewport.zoom,
      startPanX: this.viewport.panX,
      startPanY: this.viewport.panY,
      startMid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    };
  }

  _updatePinch() {
    const rect = this.canvas.getBoundingClientRect();
    const pts = [...this.activePointers.values()].slice(0, 2);
    const [p1, p2] = pts;
    const dist = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), 1);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const scaleFactor = dist / this._pinch.startDistance;
    const newZoom = clamp(this._pinch.startZoom * scaleFactor, MIN_ZOOM, MAX_ZOOM);

    const startMidLocal = { x: this._pinch.startMid.x - rect.left, y: this._pinch.startMid.y - rect.top };
    const startScale = PIXELS_PER_METER * this._pinch.startZoom;
    const worldAtStartMid = {
      x: (startMidLocal.x - this._pinch.startPanX) / startScale,
      y: (startMidLocal.y - this._pinch.startPanY) / startScale,
    };

    const midLocal = { x: mid.x - rect.left, y: mid.y - rect.top };
    const newScale = PIXELS_PER_METER * newZoom;

    this.viewport.zoom = newZoom;
    this.viewport.panX = midLocal.x - worldAtStartMid.x * newScale;
    this.viewport.panY = midLocal.y - worldAtStartMid.y * newScale;

    this.requestRender();
  }

  _onWheel(e) {
    e.preventDefault();
    const p = this._screenPointFromClient(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
    this.viewport.zoomAt(p.x, p.y, factor);
    this.requestRender();
  }

  _onKeyDown(e) {
    if (isTypingTarget(e.target)) return;

    if (e.code === 'Space' && !this.isSpaceDown) {
      this.isSpaceDown = true;
      if (!this.isPanning) this.canvas.style.cursor = 'grab';
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape') {
      this.wallEditor.cancel();
      this.requestRender();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selection.deleteSelected()) {
        e.preventDefault();
        this.requestRender();
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (key === 'v') {
      this.setTool(TOOLS.SELECT);
    } else if (key === 'w') {
      this.setTool(TOOLS.WALL);
    }
  }

  _onKeyUp(e) {
    if (e.code === 'Space') {
      this.isSpaceDown = false;
      if (!this.isPanning) {
        this.canvas.style.cursor = this.activeTool === TOOLS.WALL ? 'crosshair' : 'default';
      }
    }
  }
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
