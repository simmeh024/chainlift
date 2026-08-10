// The park's tile grid.
//
// One flat array of tiles. Anything occupying more than a single cell (a ride
// with a footprint) writes its id into every cell it covers, so occupancy
// checks stay O(1) and never have to consult the object list.

export const TILE = {
  GRASS: 0,
  PATH: 1,
  BUILDING: 2, // a ride or shop occupies this cell
  ENTRANCE: 3, // the park gate, where guests arrive
};

export class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height); // TILE.*
    this.owner = new Int32Array(width * height); // index into park.buildings, or -1
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

  set(gx, gy, type, ownerId = -1) {
    if (!this.inBounds(gx, gy)) return false;
    const i = this.index(gx, gy);
    this.tiles[i] = type;
    this.owner[i] = ownerId;
    return true;
  }

  isWalkable(gx, gy) {
    const t = this.typeAt(gx, gy);
    return t === TILE.PATH || t === TILE.ENTRANCE;
  }

  // True only if every cell of a w x h footprint anchored at (gx, gy) is bare
  // grass. Buildings may not overlap paths, so a misplaced stand can never
  // sever the walkway network.
  canPlace(gx, gy, w, h) {
    for (let y = gy; y < gy + h; y++) {
      for (let x = gx; x < gx + w; x++) {
        if (!this.inBounds(x, y)) return false;
        if (this.tiles[this.index(x, y)] !== TILE.GRASS) return false;
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
  // if at least one of these is a path tile; that is where its queue forms.
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
    };
  }

  static deserialize(data) {
    const grid = new Grid(data.width, data.height);
    grid.tiles.set(data.tiles);
    grid.owner.set(data.owner);
    return grid;
  }
}
