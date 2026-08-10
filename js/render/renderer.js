// Canvas renderer.
//
// Ground and scenery are Kenney's CC0 city tiles, drawn at native resolution
// on the same 2:1 projection. Rides are still drawn as geometry, deliberately:
// no CC0 theme-park art exists, and rides are the things that need to animate.
//
// Everything is painted back to front in one sorted pass, so a tall ride never
// covers a guest standing in front of it.

import { TILE_W, TILE_H, ELEVATION_STEP, gridToScreen, depthOf } from '../core/iso.js';
import { TILE } from '../core/grid.js';
import { STATE } from '../sim/guests.js';
import { spriteFor, PALETTE, FACE_SHADE } from './sprites.js';

// Which sprite covers which tile type. A type with no entry is drawn by hand.
const TILE_SPRITE = {
  [TILE.PATH]: 'pavement',
  [TILE.ENTRANCE]: 'asphalt',
  [TILE.WATER]: 'water',
};

const PROCEDURAL_TOP = {
  [TILE.GRASS]: PALETTE.grassTop,
  [TILE.PATH]: PALETTE.pavementTop,
  [TILE.ENTRANCE]: PALETTE.asphaltTop,
  [TILE.WATER]: PALETTE.waterTop,
  [TILE.BUILDING]: '#6d6455',
  [TILE.SCENERY]: PALETTE.grassTop,
};

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.hover = null;
    this.ghost = null;
    this.tint = null; // set by the day/night cycle
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(park) {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    this.camera.applyTo(ctx);

    this.drawGround(park);
    this.drawGhost(park);

    const drawables = [];
    for (const b of park.buildings) {
      if (!b.active) continue;
      const level = park.grid.levelAt(b.gx, b.gy);
      drawables.push({
        depth: depthOf(b.gx + b.w - 1, b.gy + b.h - 1, level) + 1,
        kind: 'building',
        ref: b,
        level,
      });
    }
    for (const g of park.guests) {
      if (g.state === STATE.GONE) continue;
      const level = park.grid.levelAt(Math.round(g.rx), Math.round(g.ry));
      drawables.push({
        depth: depthOf(g.rx, g.ry, level) + 2,
        kind: 'guest',
        ref: g,
        level,
      });
    }
    drawables.sort((a, b) => a.depth - b.depth);

    for (const item of drawables) {
      if (item.kind === 'building') this.drawBuilding(item.ref, item.level);
      else this.drawGuest(item.ref, item.level);
    }

    this.drawHover(park);
    ctx.restore();
  }

  // --- ground -----------------------------------------------------------

  drawGround(park) {
    const grid = park.grid;
    // Back to front, sweeping diagonals of constant gx+gy.
    //
    // Row-major looks like it would do, and does not: row gy+1 restarts at
    // gx=0, whose depth is far lower than the end of row gy, so a distant
    // tile gets painted over a near one. On flat ground tiles tessellate and
    // nothing overlaps, which hides it completely — it only appears once
    // terrain has height and a raised tile's earth wall covers its neighbour.
    const last = grid.width + grid.height - 2;
    for (let sum = 0; sum <= last; sum++) {
      const from = Math.max(0, sum - (grid.height - 1));
      const to = Math.min(grid.width - 1, sum);
      for (let gx = from; gx <= to; gx++) {
        this.drawTile(grid, gx, sum - gx);
      }
    }
  }

  drawTile(grid, gx, gy) {
    const i = grid.index(gx, gy);
    const type = grid.tiles[i];
    const level = grid.level[i];

    // How far the ground falls away in front of this tile. Only the two
    // front-facing neighbours matter; the back two are hidden behind it.
    const front = Math.min(
      grid.inBounds(gx + 1, gy) ? grid.levelAt(gx + 1, gy) : 0,
      grid.inBounds(gx, gy + 1) ? grid.levelAt(gx, gy + 1) : 0,
    );
    const drop = Math.max(0, level - front);
    if (drop > 0) this.drawEarthColumn(gx, gy, level, drop);

    const spriteKey = TILE_SPRITE[type];
    const sprite = spriteKey ? spriteFor(spriteKey) : null;
    const { x, y } = gridToScreen(gx, gy, level);

    if (sprite) {
      // A Kenney tile's diamond is flush with the top of its sprite and the
      // block body hangs below, so the anchor is half a tile left of the
      // cell's top corner — not half the sprite's height.
      this.ctx.drawImage(sprite, x - TILE_W / 2, y);
    } else {
      this.ctx.fillStyle = PROCEDURAL_TOP[type] || PALETTE.grassTop;
      this.diamondPath(gx, gy, level);
      this.ctx.fill();
      // Grass has no sprite, so it needs its own earth skirt to sit on.
      if (drop === 0) this.drawEarthColumn(gx, gy, level, 1, 0.55);
    }
  }

  // The exposed earth beneath a raised tile. Kenney lights from the left, so
  // the left face is the brighter of the two.
  drawEarthColumn(gx, gy, level, levels, scale = 1) {
    const ctx = this.ctx;
    const depth = levels * ELEVATION_STEP * scale;
    const n = gridToScreen(gx, gy, level);
    const east = gridToScreen(gx + 1, gy, level);
    const south = gridToScreen(gx + 1, gy + 1, level);
    const west = gridToScreen(gx, gy + 1, level);

    ctx.fillStyle = PALETTE.earthLeft;
    ctx.beginPath();
    ctx.moveTo(west.x, west.y);
    ctx.lineTo(south.x, south.y);
    ctx.lineTo(south.x, south.y + depth);
    ctx.lineTo(west.x, west.y + depth);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = PALETTE.earthRight;
    ctx.beginPath();
    ctx.moveTo(south.x, south.y);
    ctx.lineTo(east.x, east.y);
    ctx.lineTo(east.x, east.y + depth);
    ctx.lineTo(south.x, south.y + depth);
    ctx.closePath();
    ctx.fill();
  }

  diamondPath(gx, gy, level = 0, inset = 0) {
    const ctx = this.ctx;
    const n = gridToScreen(gx, gy, level);
    const e = gridToScreen(gx + 1, gy, level);
    const s = gridToScreen(gx + 1, gy + 1, level);
    const w = gridToScreen(gx, gy + 1, level);
    ctx.beginPath();
    ctx.moveTo(n.x, n.y + inset);
    ctx.lineTo(e.x - inset, e.y);
    ctx.lineTo(s.x, s.y - inset);
    ctx.lineTo(w.x + inset, w.y);
    ctx.closePath();
  }

  // --- objects ----------------------------------------------------------

  // An isometric box: two visible side faces plus a top. Face brightness
  // follows Kenney's convention (light from the left) so hand-drawn rides are
  // lit the same way as the ground they stand on.
  drawBox(gx, gy, w, h, level, height, colour, roof) {
    const ctx = this.ctx;
    const n = gridToScreen(gx, gy, level);
    const e = gridToScreen(gx + w, gy, level);
    const s = gridToScreen(gx + w, gy + h, level);
    const west = gridToScreen(gx, gy + h, level);

    ctx.fillStyle = shade(colour, FACE_SHADE.left);
    ctx.beginPath();
    ctx.moveTo(west.x, west.y);
    ctx.lineTo(s.x, s.y);
    ctx.lineTo(s.x, s.y - height);
    ctx.lineTo(west.x, west.y - height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(colour, FACE_SHADE.right);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.lineTo(e.x, e.y - height);
    ctx.lineTo(s.x, s.y - height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - height);
    ctx.lineTo(e.x, e.y - height);
    ctx.lineTo(s.x, s.y - height);
    ctx.lineTo(west.x, west.y - height);
    ctx.closePath();
    ctx.fill();
  }

  drawBuilding(building, level) {
    const spec = building.spec;
    this.drawBox(
      building.gx, building.gy, building.w, building.h,
      level, spec.height, spec.colour, spec.roof,
    );

    if (building.queue.length > 0) {
      const centre = gridToScreen(
        building.gx + building.w / 2,
        building.gy + building.h / 2,
        level,
      );
      const ctx = this.ctx;
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = building.queue.length > 8 ? '#ff9b6a' : '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      const label = String(building.queue.length);
      ctx.strokeText(label, centre.x, centre.y - spec.height - 10);
      ctx.fillText(label, centre.x, centre.y - spec.height - 10);
    }
  }

  drawGuest(guest, level) {
    const ctx = this.ctx;
    const p = gridToScreen(guest.rx + 0.5, guest.ry + 0.5, level);
    const lift = 14;

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + TILE_H / 2, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body colour carries mood: a park full of grey guests is a park in
    // trouble, readable at a glance without opening a panel.
    const light = 35 + guest.happiness * 30;
    const sat = 25 + guest.happiness * 50;
    ctx.fillStyle = `hsl(${guest.hue} ${sat}% ${light}%)`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + TILE_H / 2 - lift, 4.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- cursor -----------------------------------------------------------

  drawHover(park) {
    if (!this.hover) return;
    const ctx = this.ctx;
    const level = park.grid.levelAt(this.hover.gx, this.hover.gy);
    this.diamondPath(this.hover.gx, this.hover.gy, level, 3);
    ctx.strokeStyle = this.hover.valid ? 'rgba(255,255,255,0.9)' : 'rgba(255,110,110,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawGhost(park) {
    if (!this.ghost) return;
    const ctx = this.ctx;
    const { spec, gx, gy, valid } = this.ghost;
    const { w, h } = spec.footprint;
    const level = park.grid.levelAt(gx, gy);

    ctx.globalAlpha = 0.5;
    if (spec.kind === 'path' || spec.kind === 'terrain') {
      ctx.fillStyle = valid ? (spec.colour || PALETTE.pavementTop) : '#c04a4a';
      this.diamondPath(gx, gy, level);
      ctx.fill();
    } else {
      this.drawBox(gx, gy, w, h, level, spec.height,
        valid ? spec.colour : '#c04a4a',
        valid ? spec.roof : '#e07070');
    }
    ctx.globalAlpha = 1;
  }
}

// Multiply a hex colour by a brightness factor.
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * factor));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * factor));
  const b = Math.max(0, Math.min(255, (n & 255) * factor));
  return `rgb(${r | 0} ${g | 0} ${b | 0})`;
}
