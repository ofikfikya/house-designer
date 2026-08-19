// constants.js
//
// Single place for tunable numbers, colors, and enums used across the 2D
// editor. Phase 4 (Three.js) and later phases should import the same
// PIXELS_PER_METER / wall defaults from here rather than redefining them,
// so the 2D plan and the 3D model never drift apart on units.

export const PIXELS_PER_METER = 50; // on-screen pixels per meter at zoom = 1
export const GRID_SIZE_M = 1; // spacing of the base grid, in meters
export const GRID_MAJOR_EVERY = 5; // draw a heavier line every N grid cells

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 6;
export const ZOOM_SENSITIVITY = 0.0016; // wheel-delta -> zoom factor

export const DEFAULT_WALL_THICKNESS_M = 0.15;
export const DEFAULT_WALL_HEIGHT_M = 3.0;
export const MIN_WALL_THICKNESS_M = 0.05;
export const MAX_WALL_THICKNESS_M = 1;
export const MIN_WALL_HEIGHT_M = 0.5;
export const MAX_WALL_HEIGHT_M = 10;
export const MIN_WALL_LENGTH_M = 0.1;

export const SNAP_PIXEL_THRESHOLD = 14; // endpoint/midpoint snap radius (screen px)
export const GRID_SNAP_PIXEL_THRESHOLD = 10; // grid snap radius (screen px)
export const ANGLE_SNAP_STEP_DEG = 45;
export const ANGLE_SNAP_TOLERANCE_DEG = 6;

export const HIT_TOLERANCE_PX = 8; // extra px around a wall body for click hit-testing
export const ENDPOINT_HANDLE_RADIUS_PX = 6; // drawn radius of a selection handle
export const ENDPOINT_HANDLE_HIT_RADIUS_PX = 11; // clickable radius of a handle

export const TOOLS = Object.freeze({
  SELECT: 'select',
  WALL: 'wall',
  ROOM: 'room',
  DOOR: 'door',
  WINDOW: 'window',
});

export const COLORS = Object.freeze({
  canvasBg: '#eef1f6',
  gridMinor: '#dde3ec',
  gridMajor: '#c7d0dc',
  gridAxis: '#a7b3c6',
  wallFill: '#5b6675',
  wallStroke: '#333d4b',
  wallHoverStroke: 'rgba(36, 84, 224, 0.55)',
  wallSelectedFill: '#3b6df0',
  wallSelectedStroke: '#1c3fb8',
  wallPreviewStroke: '#2454e0',
  snapIndicator: '#f97316',
  snapIndicatorRing: 'rgba(249, 115, 22, 0.22)',
  dimensionLine: '#1c3fb8',
  dimensionText: '#1c3fb8',
  handleFill: '#ffffff',
  handleStroke: '#1c3fb8',

  roomFill: 'rgba(36, 84, 224, 0.05)',
  roomFillHover: 'rgba(36, 84, 224, 0.10)',
  roomFillSelected: 'rgba(36, 84, 224, 0.16)',
  roomStrokeSelected: '#1c3fb8',
  roomLabelName: '#1a1f29',
  roomLabelArea: '#5b6675',
});

// ---------------------------------------------------------------------
// Phase 4: 3D scene (Three.js uses numeric hex colors, not CSS strings)
// ---------------------------------------------------------------------

export const CAMERA_FOV_DEG = 50;
export const CAMERA_NEAR_M = 0.1;
export const CAMERA_FAR_M = 500;

export const DOOR_LEAF_THICKNESS_M = 0.045;
export const DOOR_FRAME_TRIM_M = 0.06;
export const WINDOW_FRAME_TRIM_M = 0.05;
export const WINDOW_GLASS_THICKNESS_RATIO = 0.4; // fraction of wall thickness

export const COLORS_3D = Object.freeze({
  sceneBackground: 0xdbe4f0,
  ground: 0xd6dce2,
  hemiSky: 0xcfe0f5,
  hemiGround: 0x8a8272,
  sun: 0xfff4e0,

  wall: 0xdadfe4,
  wallSelected: 0x3b6df0,

  doorLeaf: 0x8a5a2b,
  doorLeafSelected: 0x3b6df0,
  doorFrame: 0x5c4326,

  windowGlass: 0x9fc6f0,
  windowGlassSelected: 0x6f9de8,
  windowFrame: 0x3b6db0,
  windowFrameSelected: 0x1c3fb8,

  roomFloor: 0xf1ede3,
  roomFloorSelected: 0xd8e4ff,
});
