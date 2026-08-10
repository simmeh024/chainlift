// The park's tile grid.
//
// Flat arrays, one entry per cell. Anything occupying more than a single cell
// writes its id into every cell it covers, so occupancy checks stay O(1) and
// never have to consult the object list.
//
// Terrain is modelled as a flat top per tile at an integer height, rather than
// as sloped tile corners. A step between neighbours is walkable; a cliff is
// not. This is deliberately the simpler of the two classic models: corner
// heights give prettier hills but make every placement, path and track
// connection a four-way corner-matching problem.

export const TILE = {
  GRASS: 0,
  PATH: 1,
  BUILDING: 2, // a ride or shop occupies this cell
  ENTRANCE: 3, // the park gate, where guests arrive
  WATER: 4,
  SCENERY: 5,
};

export const MAX_HEIGHT = 8;
// The largest step guests will climb between neighbouring tiles.
export const MAX_STEP = 1;

export class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height); // TILE.*
    this.owner = new Int32Array(width * height); // index into park.buildings, or -1
    this.level = new Uint8Array(width * height); // terrain elevation
    this.owner.fill(-1);
  }

  inBounds(gx, gy) {
    return gx >= 0 && gy >= 0 && gx < this.width && gy < this.height;
  }

  index(gx, gy) {
    return gy * this.width + gx;
  }

  typeAt(gx, gy) {
    if (!this.inBounds(gx, gy)) return null;
    return this.tiles[this.index(gx, gy)];
  }

  ownerAt(gx, gy) {
    if (!this.inBounds(gx, gy)) return -1;
    return this.owner[this.index(gx, gy)];
  }

  levelAt(gx, gy) {
    if (!this.inBounds(gx, gy)) return 0;
    return this.level[this.index(gx, gy)];
  }

  set(gx, gy, type, ownerId = -1) {
    if (!this.inBounds(gx, gy)) return false;
    const i = this.index(gx, gy);
    this.tiles[i] = type;
    this.owner[i] = ownerId;
    return true;
  }

  setLevel(gx, gy, value) {
    if (!this.inBounds(gx, gy)) return false;
    this.level[this.index(gx, gy)] = Math.max(0, Math.min(MAX_HEIGHT, value));
    return true;
  }

  // --- terrain ----------------------------------------------------------

  // Raising or lowering is refused under anything built, because a building
  // sits on a flat pad and there is no sensible way to reinterpret it on a
  // slope. Saying no is better than silently leaving a ride floating.
  canReshape(gx, gy) {
    const type = this.typeAt(gx, gy);
    return type === TILE.GRASS || type === TILE.WATER;
  }

  reshape(gx, gy, delta) {
    if (!this.inBounds(gx, gy) || !this.canReshape(gx, gy)) return false;
    const i = this.index(gx, gy);
    const next = Math.max(0, Math.min(MAX_HEIGHT, this.level[i] + delta));
    if (next === this.level[i]) return false;
    this.level[i] = next;
    // Land raised out of the water stops being water, and land dropped to the
    // floor floods. Without this you get dry tiles below the waterline.
    if (this.tiles[i] === TILE.WATER && next > 0) this.tiles[i] = TILE.GRASS;
    else if (this.tiles[i] === TILE.GRASS && next === 0 && this.floodAtZero) this.tiles[i] = TILE.WATER;
    return true;
  }

  isWalkable(gx, gy) {
    const t = this.typeAt(gx, gy);
    return t === TILE.PATH || t === TILE.ENTRANCE;
  }

  // Walkable *and* reachable from (fromX, fromY): a path tile at the top of a
  // cliff is not somewhere a guest can step to.
  canStep(fromX, fromY, toX, toY) {
    if (!this.isWalkable(toX, toY)) return false;
    const drop = Math.abs(this.levelAt(toX, toY) - this.levelAt(fromX, fromY));
    return drop <= MAX_STEP;
  }

  // True only if every cell of a w x h footprint is bare grass at one common
  // height. Buildings may not overlap paths, so a misplaced stand can never
  // sever the walkway network, and may not straddle a slope.
  canPlace(gx, gy, w, h) {
    if (!this.inBounds(gx, gy) || !this.inBounds(gx + w - 1, gy + h - 1)) return false;
    const level = this.levelAt(gx, gy);
    for (let y = gy; y < gy + h; y++) {
      for (let x = gx; x < gx + w; x++) {
        if (this.tiles[this.index(x, y)] !== TILE.GRASS) return false;
        if (this.level[this.index(x, y)] !== level) return false;
      }
    }
    return true;
  }

  fill(gx, gy, w, h, type, ownerId) {
    for (let y = gy; y < gy + h; y++) {
      for (let x = gx; x < gx + w; x++) {
        this.set(x, y, type, ownerId);
      }
    }
  }

  clear(gx, gy, w, h) {
    this.fill(gx, gy, w, h, TILE.GRASS, -1);
  }

  // Cells orthogonally adjacent to a footprint. A building is only reachable
  // if at least one of these is a path tile at a climbable height.
  neighbours(gx, gy, w, h) {
    const out = [];
    for (let x = gx; x < gx + w; x++) {
      out.push({ gx: x, gy: gy - 1 });
      out.push({ gx: x, gy: gy + h });
    }
    for (let y = gy; y < gy + h; y++) {
      out.push({ gx: gx - 1, gy: y });
      out.push({ gx: gx + w, gy: y });
    }
    return out.filter((c) => this.inBounds(c.gx, c.gy));
  }

  serialize() {
    return {
      width: this.width,
      height: this.height,
      tiles: Array.from(this.tiles),
      owner: Array.from(this.owner),
      level: Array.from(this.level),
    };
  }

  static deserialize(data) {
    const grid = new Grid(data.width, data.height);
    grid.tiles.set(data.tiles);
    grid.owner.set(data.owner);
    // Saves written before terrain existed have no level array; a flat park
    // is exactly the right interpretation of one.
    if (data.level) grid.level.set(data.level);
    return grid;
  }
}
