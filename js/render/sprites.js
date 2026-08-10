// Sprite loading and the offscreen pre-render cache.
//
// Two jobs:
//
// 1. Load the Kenney city tiles. They are CC0 (see assets/kenney-city/
//    LICENSE.txt) and drawn on the same 2:1 projection this renderer uses —
//    a 132x66 diamond — so they drop straight onto the grid with no scaling.
//
// 2. Cache anything expensive to draw. A ride made of forty paths costs the
//    same as an image once it has been rendered into an offscreen canvas
//    once, which is what keeps detailed art affordable at 60fps.

import { TILE_W, TILE_H } from '../core/iso.js';

const TILE_BASE = './assets/kenney-city/tiles/';

// Kenney tiles carry no semantic names, only numbers. These were identified
// from tools/contact-sheet.html — regenerate it if the pack is ever updated.
export const TILE_ART = {
  pavement: 'cityTiles_074.png',   // plain pale slab — the footpath
  asphalt: 'cityTiles_080.png',    // dark surface — plaza
  ramp: 'cityTiles_097.png',       // sloped face — terrain transitions
  raised: 'cityTiles_098.png',     // earth block with a pale top
  water: 'cityTiles_045.png',
  treeSingle: 'cityTiles_075.png',
  treeDouble: 'cityTiles_083.png',
  lamp: 'cityTiles_057.png',
  lampDouble: 'cityTiles_058.png',
  crossing: 'cityTiles_056.png',
  fountain: 'cityTiles_043.png',
};

// Sampled from the real artwork (tools: scratchpad/sample_palette.py) so the
// tiles this renderer draws by hand sit in the same world as the ones it
// loads. Guessing these is what makes procedural and sprite art look like two
// different games bolted together.
export const PALETTE = {
  grassTop: '#89b448',
  pavementTop: '#d8d3bf',
  asphaltTop: '#696969',
  earthLeft: '#a57b52',
  earthRight: '#805f3e',
  waterTop: '#4fa3c7',
};

// Kenney lights its tiles from the LEFT: the left face is brighter than the
// right. The original drawBox() did the reverse, which would have lit every
// procedural ride from the opposite side to the ground it stands on.
export const FACE_SHADE = {
  top: 1.0,
  left: 0.90,
  right: 0.70,
};

const images = new Map();
const prerendered = new Map();

export function spriteFor(key) {
  return images.get(key) || null;
}

// Loads every tile named in TILE_ART. Resolves even if some fail: a missing
// sprite falls back to procedural drawing, so a broken asset costs detail
// rather than the whole park.
export function loadSprites() {
  const entries = Object.entries(TILE_ART);
  return Promise.all(entries.map(([key, file]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images.set(key, img); resolve({ key, ok: true }); };
    img.onerror = () => resolve({ key, ok: false });
    img.src = TILE_BASE + file;
  })));
}

// Draws once into an offscreen canvas keyed by `key`, then returns it for
// blitting. `draw(ctx, w, h)` receives a context whose origin is the top-left
// of the cached bitmap.
export function prerender(key, width, height, draw) {
  const existing = prerendered.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  draw(ctx, width, height);

  const record = { canvas, width, height, dpr };
  prerendered.set(key, record);
  return record;
}

export function blit(ctx, record, x, y) {
  ctx.drawImage(record.canvas, x, y, record.width, record.height);
}

// Anything cached from catalog art must be dropped when that art changes.
export function clearPrerenderCache() {
  prerendered.clear();
}

// A Kenney tile's diamond sits flush with the top of its sprite, with the
// block body hanging below. Drawing one so its diamond lands on a grid cell
// means offsetting left by half a tile — never by half the sprite height.
export function tileDrawOffset(sprite) {
  return { dx: -TILE_W / 2, dy: 0, w: sprite.width, h: sprite.height };
}

export { TILE_W, TILE_H };
