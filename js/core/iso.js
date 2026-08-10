// Isometric coordinate maths.
//
// The park is stored as a plain square grid. Everything on screen is that grid
// rotated 45 degrees and squashed vertically, which is the standard "2:1
// isometric" projection: a tile is twice as wide as it is tall.

export const TILE_W = 64;
export const TILE_H = 32;

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

// Grid cell -> the screen position of that cell's top corner (before camera).
export function gridToScreen(gx, gy) {
  return {
    x: (gx - gy) * HALF_W,
    y: (gx + gy) * HALF_H,
  };
}

// Screen position -> fractional grid cell. Callers that want a tile index
// should floor the result; callers doing hit-testing may want the fraction.
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
export function tileDiamond(gx, gy) {
  const { x, y } = gridToScreen(gx, gy);
  return [
    { x: x, y: y },
    { x: x + HALF_W, y: y + HALF_H },
    { x: x, y: y + TILE_H },
    { x: x - HALF_W, y: y + HALF_H },
  ];
}

// Draw order. In a 2:1 projection, a tile is drawn after everything behind it,
// and "behind" is exactly a lower gx + gy. Sorting by this value is what keeps
// tall objects from painting over the things in front of them.
export function depthOf(gx, gy) {
  return gx + gy;
}
