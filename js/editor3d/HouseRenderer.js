// editor3d/HouseRenderer.js
//
// The 2D-to-3D sync described in the brief: this subscribes to the same
// houseState "change" event Editor2D already listens to, and rebuilds
// the 3D house group from houseState.project — the same data, not a
// separate copy. A full rebuild on every change is simpler and safer
// than incremental diffing, and cheap enough for a house-sized scene
// (see README for the tradeoff note).

import { houseState } from '../state.js';
import { buildWallGroup } from './WallRenderer.js';
import { COLORS_3D } from '../constants.js';

export class HouseRenderer {
  constructor(scene3D) {
    this.scene3D = scene3D;
    this.THREE = scene3D.THREE;

    this.houseGroup = new this.THREE.Group();
    this.houseGroup.name = 'house-root';
    this.scene3D.scene.add(this.houseGroup);

    this._onChange = () => this.rebuild();
    houseState.addEventListener('change', this._onChange);

    this._onClick = (e) => this._handleClick(e);
    this.scene3D.canvas.addEventListener('click', this._onClick);

    this.rebuild();
  }

  rebuild() {
    const THREE = this.THREE;
    disposeChildren(this.houseGroup);

    const selection = houseState.selection;

    for (const room of houseState.getRooms()) {
      this.houseGroup.add(buildRoomFloorMesh(THREE, room, selection));
    }

    for (const wall of houseState.getWalls()) {
      const doorsOnWall = houseState.getDoorsOnWall(wall.id);
      const windowsOnWall = houseState.getWindowsOnWall(wall.id);
      this.houseGroup.add(buildWallGroup(THREE, wall, doorsOnWall, windowsOnWall, selection));
    }
  }

  /** Raycast from NDC coordinates (-1..1) through `camera`; returns { type, id } or null. */
  pick(ndcX, ndcY, camera) {
    const THREE = this.THREE;
    this.scene3D.scene.updateMatrixWorld(true); // don't depend on a render() having just happened
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const intersects = raycaster.intersectObjects(this.houseGroup.children, true);
    for (const hit of intersects) {
      if (hit.object.userData && hit.object.userData.type) {
        return hit.object.userData;
      }
    }
    return null;
  }

  _handleClick(e) {
    const rect = this.scene3D.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const hit = this.pick(ndcX, ndcY, this.scene3D.camera);
    if (hit) {
      houseState.setSelection(hit.type, hit.id);
    } else {
      houseState.clearSelection();
    }
  }

  dispose() {
    houseState.removeEventListener('change', this._onChange);
    this.scene3D.canvas.removeEventListener('click', this._onClick);
    disposeChildren(this.houseGroup);
    this.houseGroup.parent?.remove(this.houseGroup);
  }
}

function buildRoomFloorMesh(THREE, room, selection) {
  const shape = new THREE.Shape();
  const pts = room.points;
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2); // shape's local (x,y) -> world (x, 0, y), matching the 2D-y/3D-z convention

  const isSelected = selection.type === 'room' && selection.id === room.id;
  const material = new THREE.MeshStandardMaterial({
    color: isSelected ? COLORS_3D.roomFloorSelected : COLORS_3D.roomFloor,
    roughness: 0.95,
    // Room polygon winding isn't guaranteed to produce an upward normal
    // after rotation, and getting that guarantee right isn't worth
    // coupling this renderer to detectRooms' internal winding — showing
    // both sides is simpler and just as correct-looking from above.
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.01; // just above the ground plane, avoids z-fighting
  mesh.receiveShadow = true;
  mesh.userData = { type: 'room', id: room.id };
  return mesh;
}

function disposeChildren(group) {
  while (group.children.length > 0) {
    const child = group.children[group.children.length - 1];
    child.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
        else node.material.dispose();
      }
    });
    group.remove(child);
  }
}
