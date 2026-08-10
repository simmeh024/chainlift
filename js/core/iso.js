// Isometric coordinate maths.
//
// The park is stored as a plain square grid. Everything on screen is that grid
// rotated 45 degrees and squashed vertically, which is the standard "2:1
// isometric" projection: a tile is twice as wide as it is tall.
//
// TILE_W/TILE_H match the Kenney city tiles exactly (a 132x66 diamond), so the
// artwork draws at native resolution with no scaling and no resampling blur.

export const TILE_W = 132;
export const TILE_H = 66;

// One step of terrain elevation, in pixels. TILE_W / 4 is the vertical edge
// length that makes a cube read as a cube under this projection.
export const ELEVATION_STEP = 33;

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

// Grid cell -> the screen position of that cell's top corner (before camera).
// `height` raises the tile; elevation is purely a vertical screen offset,
// which is what lets the same projection maths serve a hilly map.
export function gridToScreen(gx, gy, height = 0) {
  return {
    x: (gx - gy) * HALF_W,
    y: (gx + gy) * HALF_H - height * ELEVATION_STEP,
  };
}

// Screen position -> fractional grid cell, ignoring elevation.
export function screenToGridExact(sx, sy) {
  return {
    gx: (sx / HALF_W + sy / HALF_H) / 2,
    gy: (sy / HALF_H - sx / HALF_W) / 2,
  };
}

export function screenToGrid(sx, sy) {
  const exact = screenToGridExact(sx, sy);
  return { gx: Math.floor(exact.gx), gy: Math.floor(exact.gy) };
}

// The four screen-space corners of a tile's diamond, clockwise from the top.
export function tileDiamond(gx, gy, height = 0) {
  const { x, y } = gridToScreen(gx, gy, height);
  return [
    { x: x, y: y },
    { x: x + HALF_W, y: y + HALF_H },
    { x: x, y: y + TILE_H },
    { x: x - HALF_W, y: y + HALF_H },
  ];
}

// Draw order. In a 2:1 projection a tile is drawn after everything behind it,
// and "behind" is a lower gx + gy. Height breaks ties: at equal depth the
// taller tile is nearer the camera and must paint last.
export function depthOf(gx, gy, height = 0) {
  return (gx + gy) * 8 + height;
}
