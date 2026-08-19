// main.js
//
// Composition root. Nothing in here holds application state — it just
// instantiates the pieces from state.js / editor2d / editor3d / ui and
// wires their events to each other and to plain DOM elements that don't
// warrant their own class.
//
// The editor3d/* modules (and three.js itself) are loaded with a dynamic
// import() the first time the user switches to 3D, not up front — so
// staying in 2D never touches the network, matching Phase 1-3's
// zero-dependency load.

import { Editor2D } from './editor2d/Editor2D.js';
import { Toolbar } from './ui/Toolbar.js';
import { PropertiesPanel } from './ui/PropertiesPanel.js';
import { houseState } from './state.js';

let editor2D = null;
let toolbar = null;
let scene3D = null;
let houseRenderer3D = null;
let cameraControllerModule = null;
let currentMode = '2d';
let currentView3D = 'perspective';

function init() {
  const canvas = document.getElementById('workspace-canvas');
  const toolbarRoot = document.getElementById('toolbar');
  const propertiesRoot = document.getElementById('properties-panel');

  editor2D = new Editor2D(canvas);
  toolbar = new Toolbar(toolbarRoot, editor2D);
  new PropertiesPanel(propertiesRoot);

  wireStatusBar(editor2D);
  wireTopBar();
  wireZoomControls(editor2D);
  wireMobilePanelToggle();
  wireEmptyHint();
  wireModeSwitch();
  wireCameraPresets();
}

function wireStatusBar(editor2D) {
  const floorEl = document.getElementById('status-floor');
  const cursorEl = document.getElementById('status-cursor');
  const lengthEl = document.getElementById('status-length');
  const areaEl = document.getElementById('status-area');
  const zoomEl = document.getElementById('status-zoom');

  editor2D.addEventListener('status', (e) => {
    const { floorName, cursor, length, area, zoomPercent } = e.detail;
    floorEl.textContent = floorName;
    cursorEl.textContent = cursor;
    lengthEl.textContent = length;
    areaEl.textContent = area;
    zoomEl.textContent = `${zoomPercent}%`;
  });
}

function wireTopBar() {
  document.getElementById('action-new').addEventListener('click', async () => {
    const ok = houseState.isEmpty() || window.confirm('Mulai proyek baru? Dinding yang sudah digambar akan hilang.');
    if (!ok) return;
    houseState.newProject();
    if (currentMode === '3d') {
      await applyCameraPreset('perspective');
    } else {
      editor2D.resetCameraToFit();
    }
  });

  document.getElementById('action-reset-view').addEventListener('click', async () => {
    if (currentMode === '3d') {
      await applyCameraPreset(currentView3D); // re-frame the same view, don't jump to a different one
    } else {
      editor2D.resetCameraToFit();
    }
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

// ---- 3D mode (Phase 4) --------------------------------------------------

function wireModeSwitch() {
  document.getElementById('mode-2d').addEventListener('click', () => setMode('2d'));
  document.getElementById('mode-3d').addEventListener('click', () => setMode('3d'));
}

async function ensure3DLoaded() {
  if (scene3D) return;
  document.body.classList.add('scene3d-is-loading');
  try {
    const [{ Scene3D }, houseRendererModule, cameraModule] = await Promise.all([
      import('./editor3d/Scene3D.js'),
      import('./editor3d/HouseRenderer.js'),
      import('./editor3d/CameraController.js'),
    ]);
    const canvas3D = document.getElementById('workspace-canvas-3d');
    scene3D = new Scene3D(canvas3D);
    houseRenderer3D = new houseRendererModule.HouseRenderer(scene3D);
    cameraControllerModule = cameraModule;
  } finally {
    document.body.classList.remove('scene3d-is-loading');
  }
}

async function setMode(mode) {
  if (mode === currentMode) return;
  const btn2D = document.getElementById('mode-2d');
  const btn3D = document.getElementById('mode-3d');

  if (mode === '3d') {
    document.body.classList.add('mode-3d');
    try {
      await ensure3DLoaded();
    } catch (err) {
      console.error('Gagal memuat Three.js dari CDN:', err);
      document.body.classList.remove('mode-3d');
      window.alert('Tidak bisa memuat tampilan 3D (Three.js gagal dimuat dari CDN). Periksa koneksi internet Anda, lalu coba lagi.');
      return;
    }

    currentMode = '3d';
    btn2D.classList.remove('topbar-btn-active');
    btn2D.setAttribute('aria-pressed', 'false');
    btn3D.classList.add('topbar-btn-active');
    btn3D.setAttribute('aria-pressed', 'true');
    toolbar.setMode('3d');

    scene3D.handleResize(); // canvas was hidden (0x0) until the class above made it visible
    scene3D.startRenderLoop();
    await applyCameraPreset('perspective');
  } else {
    currentMode = '2d';
    document.body.classList.remove('mode-3d');
    btn3D.classList.remove('topbar-btn-active');
    btn3D.setAttribute('aria-pressed', 'false');
    btn2D.classList.add('topbar-btn-active');
    btn2D.setAttribute('aria-pressed', 'true');
    toolbar.setMode('2d');
    if (scene3D) scene3D.stopRenderLoop();
  }
}

function wireCameraPresets() {
  const container = document.getElementById('camera-presets');
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.camera-preset-btn');
    if (!btn) return;
    applyCameraPreset(btn.dataset.view);
  });
}

async function applyCameraPreset(viewName) {
  await ensure3DLoaded();
  const { computeHouseBounds, computeViewTransform, applyViewTransform } = cameraControllerModule;
  const bounds = computeHouseBounds(houseState.getWalls());
  const transform = computeViewTransform(bounds, viewName);
  applyViewTransform(scene3D.camera, scene3D.controls, transform);
  currentView3D = transform.viewName;
  syncCameraPresetButtons();
}

function syncCameraPresetButtons() {
  document.querySelectorAll('.camera-preset-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === currentView3D);
  });
}

document.addEventListener('DOMContentLoaded', init);
