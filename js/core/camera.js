// Camera: pan and zoom over the isometric scene.

import { screenToGrid, screenToGridExact, gridToScreen } from './iso.js';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0; // world offset
    this.y = 0;
    this.zoom = 1;
  }

  // Centre the view on a grid cell.
  //
  // Goes through gridToScreen rather than repeating the projection maths.
  // This used to inline half-tile constants of 32 and 16, which silently
  // became wrong the moment the tile size changed — it was still centring on
  // where the cell would have been under the old 64x32 tiles.
  centreOn(gx, gy) {
    const p = gridToScreen(gx, gy);
    this.x = p.x;
    this.y = p.y;
  }

  pan(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  // Zoom toward a screen point rather than the viewport centre, so the tile
  // under the cursor stays put. Zooming to the centre walks whatever you were
  // looking at out of frame.
  zoomAt(screenX, screenY, factor) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  screenToWorld(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (sx - rect.width / 2) / this.zoom + this.x,
      y: (sy - rect.height / 2) / this.zoom + this.y,
    };
  }

  screenToGrid(sx, sy) {
    const world = this.screenToWorld(sx, sy);
    return screenToGrid(world.x, world.y);
  }

  // Fractional cell under a pointer event. Hit-testing a guest needs the
  // fraction: flooring first would snap every position to a cell corner and
  // make "nearest guest" meaningless within a tile.
  screenToWorldGrid(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const world = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    return screenToGridExact(world.x, world.y);
  }

  // Apply to a 2D context so world coordinates can be drawn directly.
  applyTo(ctx) {
    const rect = this.canvas.getBoundingClientRect();
    ctx.translate(rect.width / 2, rect.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
