// editor3d/CameraController.js
//
// Pure math first: computeHouseBounds and computeViewTransform never
// touch a THREE object, so they can be unit tested with plain asserts.
// applyViewTransform is the only part that reaches into a real
// camera/controls instance, and it's a thin, obviously-correct last step.

export function computeHouseBounds(walls) {
  if (walls.length === 0) {
    return { minX: -4, maxX: 4, minZ: -4, maxZ: 4, maxHeight: 3, centerX: 0, centerZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxHeight = 0;
  for (const wall of walls) {
    for (const p of [wall.start, wall.end]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); // 2D "y" maps to 3D "z"
      maxZ = Math.max(maxZ, p.y);
    }
    maxHeight = Math.max(maxHeight, wall.height);
  }
  return { minX, maxX, minZ, maxZ, maxHeight, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
}

const VIEW_NAMES = ['perspective', 'top', 'front', 'back', 'left', 'right'];

/** Given house bounds and a named view, compute where the camera should sit and what it should look at. */
export function computeViewTransform(bounds, viewName) {
  const sizeX = Math.max(bounds.maxX - bounds.minX, 1);
  const sizeZ = Math.max(bounds.maxZ - bounds.minZ, 1);
  const height = Math.max(bounds.maxHeight, 1);
  const radius = Math.max(sizeX, sizeZ, height) * 1.15 + 3;
  const target = { x: bounds.centerX, y: height * 0.4, z: bounds.centerZ };

  let position;
  switch (viewName) {
    case 'top':
      // Tiny Z offset avoids a perfectly-vertical look direction, which
      // is a degenerate case for orbit-style controls' up-vector.
      position = { x: bounds.centerX + 0.001, y: radius * 1.7, z: bounds.centerZ + 0.001 };
      break;
    case 'front':
      position = { x: bounds.centerX, y: height * 0.55, z: bounds.maxZ + radius };
      break;
    case 'back':
      position = { x: bounds.centerX, y: height * 0.55, z: bounds.minZ - radius };
      break;
    case 'left':
      position = { x: bounds.minX - radius, y: height * 0.55, z: bounds.centerZ };
      break;
    case 'right':
      position = { x: bounds.maxX + radius, y: height * 0.55, z: bounds.centerZ };
      break;
    case 'perspective':
    default:
      position = { x: bounds.centerX + radius * 0.62, y: radius * 0.62, z: bounds.centerZ + radius * 0.62 };
      break;
  }

  return { position, target, viewName: VIEW_NAMES.includes(viewName) ? viewName : 'perspective' };
}

/** Applies a computed transform to a real camera + OrbitControls-like instance. */
export function applyViewTransform(camera, controls, transform) {
  camera.position.set(transform.position.x, transform.position.y, transform.position.z);
  controls.target.set(transform.target.x, transform.target.y, transform.target.z);
  camera.updateProjectionMatrix();
  controls.update();
}
