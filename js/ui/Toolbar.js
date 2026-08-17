// ui/Toolbar.js
//
// The left-hand tool palette (the ASCII mockup's SELECT / WALL / ROOM /
// DOOR / WINDOW / FURNITURE / DIMENSION / MEASURE / ERASER column).
// Only Select and Wall are wired up in Phase 1. The rest are rendered
// disabled, with a tooltip naming the phase that implements them, so the
// full toolset is visible from day one without pretending it works yet.

import { TOOLS } from '../constants.js';

const TOOL_DEFINITIONS = [
  { tool: TOOLS.SELECT, label: 'Select', shortcut: 'V', icon: iconSelect() },
  { tool: TOOLS.WALL, label: 'Wall', shortcut: 'W', icon: iconWall() },
  { tool: TOOLS.ROOM, label: 'Room', shortcut: 'R', icon: iconRoom() },
  { tool: TOOLS.DOOR, label: 'Door', shortcut: 'D', icon: iconDoor() },
  { tool: TOOLS.WINDOW, label: 'Window', shortcut: 'N', icon: iconWindow() },
];

const COMING_SOON_TOOLS = [
  { label: 'Furniture', phase: 6, icon: iconFurniture() },
  { label: 'Dimension', phase: 11, icon: iconDimension() },
  { label: 'Measure', phase: 11, icon: iconMeasure() },
  { label: 'Eraser', phase: 11, icon: iconEraser() },
];

export class Toolbar {
  constructor(rootEl, editor2D) {
    this.root = rootEl;
    this.editor2D = editor2D;
    this.buttons = new Map();
    this._render();
    this.editor2D.addEventListener('toolchange', (e) => this._syncActive(e.detail.tool));
  }

  _render() {
    this.root.innerHTML = '';

    for (const def of TOOL_DEFINITIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool-btn';
      btn.title = `${def.label} (${def.shortcut})`;
      btn.innerHTML = `${def.icon}<span>${def.label}</span>`;
      btn.addEventListener('click', () => this.editor2D.setTool(def.tool));
      this.root.appendChild(btn);
      this.buttons.set(def.tool, btn);
    }

    const divider = document.createElement('div');
    divider.className = 'tool-divider';
    this.root.appendChild(divider);

    for (const def of COMING_SOON_TOOLS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool-btn tool-btn-disabled';
      btn.disabled = true;
      btn.title = `${def.label} \u2014 belum tersedia, direncanakan di Phase ${def.phase}`;
      btn.innerHTML = `${def.icon}<span>${def.label}</span>`;
      this.root.appendChild(btn);
    }

    this._syncActive(this.editor2D.activeTool);
  }

  _syncActive(tool) {
    for (const [t, btn] of this.buttons) {
      btn.classList.toggle('tool-btn-active', t === tool);
    }
  }
}

function iconSelect() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3l14 8-6 1.4L11 19z" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function iconWall() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="9" width="18" height="6" rx="1"/><line x1="8" y1="9" x2="8" y2="15"/><line x1="13" y1="9" x2="13" y2="15"/><line x1="18" y1="9" x2="18" y2="15"/></svg>';
}
function iconRoom() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>';
}
function iconDoor() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none"/></svg>';
}
function iconWindow() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>';
}
function iconFurniture() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="7" rx="1.5"/><path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3"/></svg>';
}
function iconDimension() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="17" x2="20" y2="17"/><line x1="4" y1="13" x2="4" y2="21"/><line x1="20" y1="13" x2="20" y2="21"/></svg>';
}
function iconMeasure() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 16l5-5 3 3 8-8"/><path d="M15 6h4v4"/></svg>';
}
function iconEraser() {
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13l-7 7H7l-4-4L14 5z"/><line x1="8" y1="20" x2="20" y2="20"/></svg>';
}
