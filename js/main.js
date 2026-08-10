// Chainlift — bootstrap, input and the game loop.

import { Camera } from './core/camera.js';
import { Renderer } from './render/renderer.js';
import { Park } from './sim/park.js';
import { BUILD_ITEMS, itemById } from './data/catalog.js';
import { TILE } from './core/grid.js';
import { TILE_H } from './core/iso.js';
import { Hud, Toast } from './ui/hud.js';
import { loadSprites } from './render/sprites.js';
import { savePark, loadPark, saveLocal, loadLocal } from './net/save.js';

const SIM_STEP = 1 / 30; // fixed simulation timestep
const MAX_FRAME = 0.25;  // never simulate more than this much per frame

// The tile art is 132x66, so drawing it 1:1 fills the viewport with about a
// dozen tiles. Opening zoomed out shows enough of the park to plan in.
const DEFAULT_ZOOM = 0.6;

const canvas = document.getElementById('stage');
const camera = new Camera(canvas);
const renderer = new Renderer(canvas, camera);
const hud = new Hud(document.body);
const toast = new Toast(document.getElementById('toast'));

let park = new Park();
let tool = null;        // catalog id, 'delete', or null
let speed = 1;
let panning = false;
let panLast = null;
let suppressClick = false;
// Cells already altered by the current drag, so one stroke changes each tile
// once however slowly the cursor crosses it.
const strokeTouched = new Set();

frameParkEntrance();

// Put the gate near the bottom of the view with the buildable land above it.
// Centring on the gate itself is the obvious thing and it is wrong: the gate
// sits on the map's south edge, so half the viewport ends up as off-map void.
//
// Both numbers are expressed in tiles rather than pixels. They were pixel
// constants tuned against 32px tiles, and adopting Kenney's 132x66 art
// silently broke the framing — the offset stayed put while everything it was
// measuring against doubled.
function frameParkEntrance() {
  camera.zoom = DEFAULT_ZOOM;
  camera.centreOn(park.entrance.gx, park.entrance.gy);
  camera.y -= TILE_H * 8;
}

// --- toolbar ------------------------------------------------------------

const toolbar = document.getElementById('toolbar');

function buildToolbar() {
  for (const item of BUILD_ITEMS) {
    const button = document.createElement('button');
    button.className = 'tool';
    button.dataset.tool = item.id;
    button.innerHTML = `
      <span class="tool-swatch" style="--swatch:${item.colour}"></span>
      <span class="tool-name">${item.name}</span>
      <span class="tool-cost">$${item.cost.toLocaleString('en-US')}</span>`;
    button.addEventListener('click', () => selectTool(item.id));
    toolbar.appendChild(button);
  }

  const del = document.createElement('button');
  del.className = 'tool tool-delete';
  del.dataset.tool = 'delete';
  del.innerHTML = `
    <span class="tool-swatch" style="--swatch:#c04a4a"></span>
    <span class="tool-name">Demolish</span>
    <span class="tool-cost">50% back</span>`;
  del.addEventListener('click', () => selectTool('delete'));
  toolbar.appendChild(del);
}

function selectTool(id) {
  tool = tool === id ? null : id;
  for (const button of toolbar.querySelectorAll('.tool')) {
    button.classList.toggle('is-active', button.dataset.tool === tool);
  }
  if (!tool) renderer.ghost = null;
}

// --- input --------------------------------------------------------------

function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return camera.screenToGrid(event.clientX - rect.left, event.clientY - rect.top);
}

canvas.addEventListener('mousemove', (event) => {
  if (panning && panLast) {
    camera.pan(event.clientX - panLast.x, event.clientY - panLast.y);
    panLast = { x: event.clientX, y: event.clientY };
    suppressClick = true;
    return;
  }

  const cell = cellFromEvent(event);
  if (!park.grid.inBounds(cell.gx, cell.gy)) {
    renderer.hover = null;
    renderer.ghost = null;
    return;
  }

  if (tool && tool !== 'delete') {
    const spec = itemById(tool);
    const { w, h } = spec.footprint;
    let valid;
    if (spec.kind === 'path') {
      valid = park.grid.typeAt(cell.gx, cell.gy) === TILE.GRASS && park.canAfford(spec);
    } else if (spec.kind === 'terrain') {
      valid = park.grid.canReshape(cell.gx, cell.gy) && park.canAfford(spec);
    } else {
      valid = park.grid.canPlace(cell.gx, cell.gy, w, h) && park.canAfford(spec);
    }
    renderer.ghost = { spec, gx: cell.gx, gy: cell.gy, valid };
    renderer.hover = null;
  } else {
    renderer.ghost = null;
    renderer.hover = { gx: cell.gx, gy: cell.gy, valid: tool !== 'delete' || park.grid.typeAt(cell.gx, cell.gy) !== TILE.GRASS };
  }
});

canvas.addEventListener('mousedown', (event) => {
  // Middle button, right button, or a plain drag with no tool selected pans.
  if (event.button === 1 || event.button === 2 || (event.button === 0 && !tool)) {
    panning = true;
    panLast = { x: event.clientX, y: event.clientY };
    suppressClick = false;
    canvas.classList.add('is-panning');
  }
});

window.addEventListener('mouseup', () => {
  panning = false;
  panLast = null;
  strokeTouched.clear();
  canvas.classList.remove('is-panning');
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('click', (event) => {
  if (suppressClick) { suppressClick = false; return; }
  if (!tool) return;

  const cell = cellFromEvent(event);
  if (!park.grid.inBounds(cell.gx, cell.gy)) return;

  if (tool === 'delete') {
    const result = park.removeAt(cell.gx, cell.gy);
    if (!result.ok) toast.show(result.reason, 'warn');
    else if (result.refund) toast.show(`Demolished, $${result.refund} back`, 'info');
    return;
  }

  const result = park.place(tool, cell.gx, cell.gy);
  if (!result.ok) toast.show(result.reason, 'warn');
});

// Dragging out a run of path is the single most-used action in this genre;
// clicking every tile individually would be miserable.
canvas.addEventListener('mousemove', (event) => {
  // Paths and terrain are both painted in strokes rather than placed one cell
  // at a time; clicking every tile of a footpath or a hillside is miserable.
  const draggable = tool === 'path' || tool === 'raise' || tool === 'lower';
  if (!draggable || !(event.buttons & 1) || panning) return;
  const cell = cellFromEvent(event);
  if (!park.grid.inBounds(cell.gx, cell.gy)) return;
  // One change per cell per stroke, or a slow drag would raise the same tile
  // to maximum height under a stationary cursor.
  const key = `${cell.gx},${cell.gy}`;
  if (strokeTouched.has(key)) return;
  strokeTouched.add(key);
  park.place(tool, cell.gx, cell.gy);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  camera.zoomAt(
    event.clientX - rect.left,
    event.clientY - rect.top,
    event.deltaY < 0 ? 1.12 : 1 / 1.12,
  );
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea')) return;

  const numeric = parseInt(event.key, 10);
  if (numeric >= 1 && numeric <= BUILD_ITEMS.length) {
    selectTool(BUILD_ITEMS[numeric - 1].id);
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'escape': selectTool(null); break;
    case 'x': selectTool('delete'); break;
    case ' ': event.preventDefault(); setSpeed(speed === 0 ? 1 : 0); break;
    case '=': case '+': setSpeed(Math.min(4, (speed || 1) * 2)); break;
    case '-': setSpeed(Math.max(1, (speed || 1) / 2)); break;
  }
});

// --- speed --------------------------------------------------------------

function setSpeed(value) {
  speed = value;
  for (const button of document.querySelectorAll('[data-speed]')) {
    button.classList.toggle('is-active', Number(button.dataset.speed) === speed);
  }
}

for (const button of document.querySelectorAll('[data-speed]')) {
  button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
}

// --- persistence --------------------------------------------------------

document.getElementById('btn-save').addEventListener('click', async () => {
  saveLocal(park);
  try {
    await savePark(park);
    toast.show('Park saved', 'good');
  } catch (err) {
    // The local copy already succeeded, so this is a degraded save and not a
    // lost one. Say which happened rather than claiming a clean save.
    toast.show('Saved locally — server: ' + err.message, 'warn');
  }
});

document.getElementById('btn-load').addEventListener('click', async () => {
  try {
    const data = await loadPark();
    park = Park.deserialize(data.state);
    toast.show('Park loaded', 'good');
  } catch (err) {
    const local = loadLocal();
    if (local) {
      park = Park.deserialize(local);
      toast.show('Loaded local save — server: ' + err.message, 'warn');
    } else {
      toast.show('Nothing to load: ' + err.message, 'warn');
    }
  }
});

document.getElementById('btn-new').addEventListener('click', () => {
  park = new Park();
  frameParkEntrance();
  toast.show('New park', 'info');
});

// --- loop ---------------------------------------------------------------

let accumulator = 0;
let last = performance.now();

function frame(now) {
  let delta = (now - last) / 1000;
  last = now;
  // A backgrounded tab hands back an enormous delta on return. Cap it, or the
  // catch-up loop runs thousands of steps and locks the page.
  delta = Math.min(delta, MAX_FRAME);

  accumulator += delta * speed;
  let steps = 0;
  while (accumulator >= SIM_STEP && steps < 240) {
    park.tick(SIM_STEP);
    accumulator -= SIM_STEP;
    steps++;
  }

  renderer.draw(park);
  hud.update(park);
  requestAnimationFrame(frame);
}

async function init() {
  buildToolbar();
  setSpeed(1);
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());

  // Wait for the tile art before the first frame, or the opening view is a
  // park drawn entirely in fallback colours that then pops. loadSprites never
  // rejects — a sprite that fails to load falls back to procedural drawing.
  const loaded = await loadSprites();
  const missing = loaded.filter((r) => !r.ok).map((r) => r.key);
  if (missing.length) {
    toast.show(`Some tile art did not load: ${missing.join(', ')}`, 'warn');
  }

  const local = loadLocal();
  if (local) {
    try {
      park = Park.deserialize(local);
      toast.show('Resumed your last park', 'info');
    } catch (err) {
      toast.show('Local save was unreadable, started fresh', 'warn');
    }
  }

  requestAnimationFrame(frame);
}

init();
