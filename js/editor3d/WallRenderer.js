// editor3d/WallRenderer.js
//
// Converts one wall (+ the doors/windows attached to it) into a
// THREE.Group of boxes. Takes `THREE` as a parameter instead of
// importing it — this file is only ever reached after Scene3D has
// already loaded three.js, but staying import-free keeps that lazy-load
// boundary explicit rather than accidental.

import { computeWallSolidSegments } from '../openings.js';
import { getDoorMesh3DParams } from '../objects/doors.js';
import { getWindowMesh3DParams } from '../objects/windows.js';
import { COLORS_3D } from '../constants.js';

export function buildWallGroup(THREE, wall, doorsOnWall, windowsOnWall, selection) {
  const group = new THREE.Group();
  group.name = `wall-${wall.id}`;

  const wallSelected = selection.type === 'wall' && selection.id === wall.id;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: wallSelected ? COLORS_3D.wallSelected : COLORS_3D.wall,
    roughness: 0.92,
    metalness: 0.02,
  });

  const openings = [...doorsOnWall, ...windowsOnWall];
  const segments = computeWallSolidSegments(wall, openings);
  for (const seg of segments) {
    const dx = seg.end.x - seg.start.x;
    const dz = seg.end.y - seg.start.y;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const mesh = buildBoxMesh(THREE, {
      width: length,
      height: wall.height,
      depth: wall.thickness,
      position: { x: (seg.start.x + seg.end.x) / 2, y: wall.height / 2, z: (seg.start.y + seg.end.y) / 2 },
      rotationY: -Math.atan2(dz, dx),
    }, wallMaterial);
    mesh.userData = { type: 'wall', id: wall.id };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const door of doorsOnWall) {
    addDoorMeshes(THREE, group, wall, door, selection);
  }
  for (const win of windowsOnWall) {
    addWindowMeshes(THREE, group, wall, win, selection);
  }

  return group;
}

function addDoorMeshes(THREE, group, wall, door, selection) {
  const isSelected = selection.type === 'door' && selection.id === door.id;
  const { leaf, frame } = getDoorMesh3DParams(wall, door);

  const leafMaterial = new THREE.MeshStandardMaterial({
    color: isSelected ? COLORS_3D.doorLeafSelected : COLORS_3D.doorLeaf,
    roughness: 0.75,
  });
  const leafMesh = buildBoxMesh(THREE, leaf, leafMaterial);
  leafMesh.userData = { type: 'door', id: door.id };
  leafMesh.castShadow = true;
  group.add(leafMesh);

  const frameMaterial = new THREE.MeshStandardMaterial({ color: COLORS_3D.doorFrame, roughness: 0.85 });
  for (const piece of frame) {
    const pieceMesh = buildBoxMesh(THREE, piece, frameMaterial);
    pieceMesh.userData = { type: 'door', id: door.id };
    group.add(pieceMesh);
  }
}

function addWindowMeshes(THREE, group, wall, win, selection) {
  const isSelected = selection.type === 'window' && selection.id === win.id;
  const { glass, frame } = getWindowMesh3DParams(wall, win);

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: isSelected ? COLORS_3D.windowGlassSelected : COLORS_3D.windowGlass,
    transparent: true,
    opacity: 0.42,
    roughness: 0.08,
    metalness: 0.05,
  });
  const glassMesh = buildBoxMesh(THREE, glass, glassMaterial);
  glassMesh.userData = { type: 'window', id: win.id };
  group.add(glassMesh);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: isSelected ? COLORS_3D.windowFrameSelected : COLORS_3D.windowFrame,
    roughness: 0.6,
  });
  for (const piece of frame) {
    const pieceMesh = buildBoxMesh(THREE, piece, frameMaterial);
    pieceMesh.userData = { type: 'window', id: win.id };
    group.add(pieceMesh);
  }
}

function buildBoxMesh(THREE, params, material) {
  const geometry = new THREE.BoxGeometry(params.width, params.height, params.depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(params.position.x, params.position.y, params.position.z);
  mesh.rotation.y = params.rotationY;
  return mesh;
}
