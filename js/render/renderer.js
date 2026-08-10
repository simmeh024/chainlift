// Canvas renderer.
//
// No sprites yet — everything is drawn as isometric geometry. That keeps the
// whole thing dependency-free and means a new ride needs a catalog entry and
// nothing else. Art can replace these shapes later without touching the sim.

import { TILE_H, gridToScreen, depthOf } from '../core/iso.js';
import { TILE } from '../core/grid.js';
import { STATE } from '../sim/guests.js';

const GROUND = {
  [TILE.GRASS]: ['#4a7c3f', '#436f39'],
  [TILE.PATH]: ['#9a8f82', '#8d8378'],
  [TILE.BUILDING]: ['#5c5347', '#524a3f'],
  [TILE.ENTRANCE]: ['#c8a44a', '#b39238'],
};

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.hover = null; // { gx, gy, valid }
    this.ghost = null; // { spec, gx, gy, valid }
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
    this.drawGhost();

    // One sorted pass over everything with height, so a tall ride never paints
    // over a guest standing in front of it.
    const drawables = [];
    for (const b of park.buildings) {
      if (!b.active) continue;
      drawables.push({ depth: depthOf(b.gx + b.w, b.gy + b.h), kind: 'building', ref: b });
    }
    for (const g of park.guests) {
      if (g.state === STATE.GONE) continue;
      drawables.push({ depth: depthOf(g.rx, g.ry) + 0.5, kind: 'guest', ref: g });
    }
    drawables.sort((a, b) => a.depth - b.depth);

    for (const item of drawables) {
      if (item.kind === 'building') this.drawBuilding(item.ref);
      else this.drawGuest(item.ref);
    }

    this.drawHover();
    ctx.restore();
  }

  drawGround(park) {
    const ctx = this.ctx;
    const grid = park.grid;

    for (let gy = 0; gy < grid.height; gy++) {
      for (let gx = 0; gx < grid.width; gx++) {
        const type = grid.tiles[grid.index(gx, gy)];
        const palette = GROUND[type] || GROUND[TILE.GRASS];
        // Checker the two shades so the grid reads without drawing gridlines.
        ctx.fillStyle = palette[(gx + gy) % 2];
        this.diamondPath(gx, gy);
        ctx.fill();
      }
    }
  }

  diamondPath(gx, gy, inset = 0) {
    const ctx = this.ctx;
    const n = gridToScreen(gx, gy);
    const e = gridToScreen(gx + 1, gy);
    const s = gridToScreen(gx + 1, gy + 1);
    const w = gridToScreen(gx, gy + 1);
    ctx.beginPath();
    ctx.moveTo(n.x, n.y + inset);
    ctx.lineTo(e.x - inset, e.y);
    ctx.lineTo(s.x, s.y - inset);
    ctx.lineTo(w.x + inset, w.y);
    ctx.closePath();
  }

  // An isometric box: two visible side faces plus a top.
  drawBox(gx, gy, w, h, height, colour, roof) {
    const ctx = this.ctx;
    const n = gridToScreen(gx, gy);
    const e = gridToScreen(gx + w, gy);
    const s = gridToScreen(gx + w, gy + h);
    const west = gridToScreen(gx, gy + h);

    // Left face
    ctx.fillStyle = shade(colour, -0.22);
    ctx.beginPath();
    ctx.moveTo(west.x, west.y);
    ctx.lineTo(s.x, s.y);
    ctx.lineTo(s.x, s.y - height);
    ctx.lineTo(west.x, west.y - height);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.lineTo(e.x, e.y - height);
    ctx.lineTo(s.x, s.y - height);
    ctx.closePath();
    ctx.fill();

    // Top
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - height);
    ctx.lineTo(e.x, e.y - height);
    ctx.lineTo(s.x, s.y - height);
    ctx.lineTo(west.x, west.y - height);
    ctx.closePath();
    ctx.fill();
  }

  drawBuilding(building) {
    const spec = building.spec;
    this.drawBox(
      building.gx, building.gy, building.w, building.h,
      spec.height, spec.colour, spec.roof,
    );

    // Queue length, above the roof. Only when there is one — a permanent "0"
    // over every stall is noise.
    if (building.queue.length > 0) {
      const centre = gridToScreen(building.gx + building.w / 2, building.gy + building.h / 2);
      const ctx = this.ctx;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = building.queue.length > 8 ? '#ff9b6a' : '#e8f0f8';
      ctx.fillText(String(building.queue.length), centre.x, centre.y - spec.height - 8);
    }
  }

  drawGuest(guest) {
    const ctx = this.ctx;
    const p = gridToScreen(guest.rx + 0.5, guest.ry + 0.5);
    const lift = 10;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + TILE_H / 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body colour carries mood: a park full of grey guests is a park in
    // trouble, readable at a glance without opening a panel.
    const light = 35 + guest.happiness * 30;
    const sat = 25 + guest.happiness * 50;
    ctx.fillStyle = `hsl(${guest.hue} ${sat}% ${light}%)`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + TILE_H / 2 - lift, 3.2, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHover() {
    if (!this.hover) return;
    const ctx = this.ctx;
    this.diamondPath(this.hover.gx, this.hover.gy, 2);
    ctx.strokeStyle = this.hover.valid ? 'rgba(255,255,255,0.85)' : 'rgba(255,110,110,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawGhost() {
    if (!this.ghost) return;
    const ctx = this.ctx;
    const { spec, gx, gy, valid } = this.ghost;
    const { w, h } = spec.footprint;

    ctx.globalAlpha = 0.45;
    if (spec.kind === 'path') {
      ctx.fillStyle = valid ? spec.colour : '#c04a4a';
      this.diamondPath(gx, gy);
      ctx.fill();
    } else {
      this.drawBox(gx, gy, w, h, spec.height,
        valid ? spec.colour : '#c04a4a',
        valid ? spec.roof : '#e07070');
    }
    ctx.globalAlpha = 1;
  }
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount * 255));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount * 255));
  const b = Math.max(0, Math.min(255, (n & 255) + amount * 255));
  return `rgb(${r | 0} ${g | 0} ${b | 0})`;
}
