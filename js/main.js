// main.js
//
// Composition root. Nothing in here holds application state — it just
// instantiates the pieces from state.js / editor2d / ui and wires their
// events to each other and to plain DOM elements (status bar, top bar,
// zoom buttons) that don't warrant their own class yet.

import { Editor2D } from './editor2d/Editor2D.js';
import { Toolbar } from './ui/Toolbar.js';
import { PropertiesPanel } from './ui/PropertiesPanel.js';
import { houseState } from './state.js';

function init() {
  const canvas = document.getElementById('workspace-canvas');
  const toolbarRoot = document.getElementById('toolbar');
  const propertiesRoot = document.getElementById('properties-panel');

  const editor2D = new Editor2D(canvas);
  new Toolbar(toolbarRoot, editor2D);
  new PropertiesPanel(propertiesRoot);

  wireStatusBar(editor2D);
  wireTopBar(editor2D);
  wireZoomControls(editor2D);
  wireMobilePanelToggle();
  wireEmptyHint();
}

function wireStatusBar(editor2D) {
  const floorEl = document.getElementById('status-floor');
  const cursorEl = document.getElementById('status-cursor');
  const lengthEl = document.getElementById('status-length');
  const zoomEl = document.getElementById('status-zoom');

  editor2D.addEventListener('status', (e) => {
    const { floorName, cursor, length, zoomPercent } = e.detail;
    floorEl.textContent = floorName;
    cursorEl.textContent = cursor;
    lengthEl.textContent = length;
    zoomEl.textContent = `${zoomPercent}%`;
  });
}

function wireTopBar(editor2D) {
  document.getElementById('action-new').addEventListener('click', () => {
    const ok = houseState.isEmpty() || window.confirm('Mulai proyek baru? Dinding yang sudah digambar akan hilang.');
    if (ok) {
      houseState.newProject();
      editor2D.resetCameraToFit();
    }
  });

  document.getElementById('action-reset-view').addEventListener('click', () => {
    editor2D.resetCameraToFit();
  });
}

function wireZoomControls(editor2D) {
  document.getElementById('zoom-in').addEventListener('click', () => editor2D.zoomIn());
  document.getElementById('zoom-out').addEventListener('click', () => editor2D.zoomOut());
}

function wireMobilePanelToggle() {
  const toggleBtn = document.getElementById('mobile-panel-toggle');
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('mobile-panel-open');
  });
}

function wireEmptyHint() {
  const hint = document.getElementById('empty-hint');
  const update = () => {
    hint.classList.toggle('is-visible', houseState.getWalls().length === 0);
  };
  houseState.addEventListener('change', update);
  update();
}

document.addEventListener('DOMContentLoaded', init);
