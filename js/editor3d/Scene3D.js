// editor3d/Scene3D.js
//
// Owns the actual WebGL side: Scene, PerspectiveCamera, WebGLRenderer,
// OrbitControls, lighting, and ground plane. HouseRenderer (a sibling
// module, not imported here) is responsible for populating the scene's
// contents from houseState — this file only owns the "empty room" plus
// the render loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS_3D, CAMERA_FOV_DEG, CAMERA_NEAR_M, CAMERA_FAR_M } from '../constants.js';

export class Scene3D {
  constructor(canvas) {
    this.THREE = THREE;
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS_3D.sceneBackground);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR_M, CAMERA_FAR_M);
    this.camera.position.set(10, 9, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't let the camera dip below the ground
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 200;
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    this._setupLights();
    this._setupGround();

    this._resizeObserver = new ResizeObserver(() => this.handleResize());
    this._resizeObserver.observe(canvas);
    this.handleResize();

    this._running = false;
    this._boundFrame = () => this._frame();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(COLORS_3D.hemiSky, COLORS_3D.hemiGround, 1.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(COLORS_3D.sun, 2.4);
    sun.position.set(12, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sunLight = sun;
  }

  _setupGround() {
    const geometry = new THREE.PlaneGeometry(300, 300);
    const material = new THREE.MeshStandardMaterial({ color: COLORS_3D.ground, roughness: 1 });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  startRenderLoop() {
    if (this._running) return;
    this._running = true;
    requestAnimationFrame(this._boundFrame);
  }

  stopRenderLoop() {
    this._running = false;
  }

  _frame() {
    if (!this._running) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._boundFrame);
  }

  dispose() {
    this.stopRenderLoop();
    this._resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
