// The park: everything that makes up a save file, plus the tick that moves it.

import { Grid, TILE } from '../core/grid.js';
import { itemById, NEED } from '../data/catalog.js';
import { findPath } from './pathfinding.js';
import { Guest, updateGuests, STATE } from './guests.js';

export const GRID_SIZE = 48;
const STARTING_MONEY = 12000;

// One real second is one game minute, so a full in-park day takes 24 real
// minutes. Fast enough to see consequences, slow enough that a decision is
// not instantly obsolete.
const MINUTES_PER_SECOND = 1;

export class Park {
  constructor(name = 'Chainlift Park') {
    this.name = name;
    this.grid = new Grid(GRID_SIZE, GRID_SIZE);
    this.buildings = [];
    this.guests = [];
    this.money = STARTING_MONEY;
    this.minutes = 9 * 60; // parks open at 09:00
    this.day = 1;
    this.entranceFee = 12;
    this.spawnAccumulator = 0;

    this.stats = {
      revenue: 0,
      admitted: 0,
      departed: 0,
      happinessSum: 0,
      happinessSamples: 0,
    };

    this.accessTiles = new Map(); // tile index -> building ids reachable from it
    this.buildEntrance();
  }

  // The gate sits on the near edge with a short stub of path, so a brand new
  // park is already something a guest can stand on. Starting with nothing at
  // all just means the first guest spawns onto grass and dies.
  buildEntrance() {
    const mid = Math.floor(GRID_SIZE / 2);
    this.entrance = { gx: mid, gy: GRID_SIZE - 1 };
    this.grid.set(this.entrance.gx, this.entrance.gy, TILE.ENTRANCE, -1);
    for (let i = 1; i <= 4; i++) {
      this.grid.set(mid, GRID_SIZE - 1 - i, TILE.PATH, -1);
    }
    this.rebuildAccess();
  }

  get clock() {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get averageHappiness() {
    if (this.guests.length === 0) return 0;
    const total = this.guests.reduce((sum, g) => sum + g.happiness, 0);
    return total / this.guests.length;
  }

  // 0..1000, the genre's usual scale. Happiness dominates, but a park with one
  // ride cannot score well no matter how content its handful of guests are.
  get rating() {
    const rides = this.buildings.filter((b) => b.spec.kind === 'ride' && b.active);
    const shops = this.buildings.filter((b) => b.spec.kind === 'shop' && b.active);
    const variety = Math.min(1, rides.length / 6) * 0.5 + Math.min(1, shops.length / 4) * 0.2;
    const happiness = this.guests.length > 0 ? this.averageHappiness : 0.4;
    const score = happiness * 0.6 + variety * 0.4;
    return Math.round(score * 1000);
  }

  // --- building ---------------------------------------------------------

  canAfford(spec) {
    return this.money >= spec.cost;
  }

  place(itemId, gx, gy) {
    const spec = itemById(itemId);
    if (!spec) return { ok: false, reason: 'Unknown item' };
    if (!this.canAfford(spec)) return { ok: false, reason: 'Not enough money' };

    if (spec.kind === 'path') {
      if (this.grid.typeAt(gx, gy) !== TILE.GRASS) {
        return { ok: false, reason: 'Something is already there' };
      }
      this.grid.set(gx, gy, TILE.PATH, -1);
      this.money -= spec.cost;
      this.rebuildAccess();
      return { ok: true };
    }

    const { w, h } = spec.footprint;
    if (!this.grid.canPlace(gx, gy, w, h)) {
      return { ok: false, reason: 'Blocked or out of bounds' };
    }

    const id = this.buildings.length;
    const building = {
      id,
      itemId,
      spec,
      gx,
      gy,
      w,
      h,
      queue: [],
      busyTimer: 0,
      loaded: 0,
      dwell: 0,
      totalCustomers: 0,
      revenue: 0,
      active: true,
    };
    this.buildings.push(building);
    this.grid.fill(gx, gy, w, h, TILE.BUILDING, id);
    this.money -= spec.cost;
    this.rebuildAccess();
    return { ok: true, building };
  }

  removeAt(gx, gy) {
    const type = this.grid.typeAt(gx, gy);
    if (type === TILE.ENTRANCE) return { ok: false, reason: 'The gate cannot be removed' };

    if (type === TILE.PATH) {
      this.grid.set(gx, gy, TILE.GRASS, -1);
      this.rebuildAccess();
      return { ok: true, refund: 0 };
    }

    if (type === TILE.BUILDING) {
      const id = this.grid.ownerAt(gx, gy);
      const building = this.buildings[id];
      if (!building) return { ok: false, reason: 'Nothing there' };

      // Half the build cost back, and anyone queuing is turned loose rather
      // than left holding a reference to a building that no longer exists.
      const refund = Math.floor(building.spec.cost / 2);
      this.money += refund;
      building.active = false;
      for (const guest of this.guests) {
        if (guest.targetBuilding === id) {
          guest.targetBuilding = null;
          guest.state = STATE.WALKING;
        }
      }
      this.grid.clear(building.gx, building.gy, building.w, building.h);
      this.rebuildAccess();
      return { ok: true, refund };
    }

    return { ok: false, reason: 'Nothing to remove' };
  }

  // Which path tiles can reach which buildings. Recomputed whenever the map
  // changes; the park is small enough that this is cheaper and far less
  // error-prone than patching the map incrementally.
  rebuildAccess() {
    this.accessTiles.clear();
    for (const building of this.buildings) {
      if (!building.active) continue;
      for (const cell of this.grid.neighbours(building.gx, building.gy, building.w, building.h)) {
        if (!this.grid.isWalkable(cell.gx, cell.gy)) continue;
        const idx = this.grid.index(cell.gx, cell.gy);
        if (!this.accessTiles.has(idx)) this.accessTiles.set(idx, []);
        this.accessTiles.get(idx).push(building.id);
      }
    }
  }

  // Nearest building serving `need` that the guest can actually afford.
  //
  // BFS reaches candidates in distance order, so a guest with wanderlust can
  // decline the first one or two and end up somewhere further out. That is the
  // whole reason the back of the park ever gets visited.
  findNearestAccess(guest, need, cash) {
    const search = (wanderlust) => {
      let found = null;
      let sawCandidate = false;
      // Skipped *buildings*, not skipped tiles. A building can border the path
      // in several places, and counting tiles let one ride consume the whole
      // skip budget by itself — which pinned every guest to the first two
      // attractions and left the back of the park with no visitors at all.
      const skipped = new Set();

      const path = findPath(this.grid, { gx: guest.gx, gy: guest.gy }, (gx, gy) => {
        const ids = this.accessTiles.get(this.grid.index(gx, gy));
        if (!ids) return false;
        for (const id of ids) {
          const building = this.buildings[id];
          if (!building || !building.active) continue;
          if (building.spec.satisfies !== need) continue;
          if (building.spec.price > cash) continue;

          sawCandidate = true;
          if (skipped.has(id)) continue; // already walked past this one
          if (skipped.size < 2 && Math.random() < wanderlust) {
            skipped.add(id);
            continue;
          }
          found = id;
          return true;
        }
        return false;
      });

      return { path, found, sawCandidate };
    };

    let result = search(guest.wanderlust || 0);

    // Everything on offer got declined. Something suitable does exist, so take
    // the nearest rather than reporting the park as having nothing to do.
    if (result.found === null && result.sawCandidate) {
      result = search(0);
    }

    if (!result.path || result.found === null) return null;
    return { buildingId: result.found, path: result.path };
  }

  // --- simulation -------------------------------------------------------

  tick(dt) {
    this.minutes += dt * MINUTES_PER_SECOND;
    if (this.minutes >= 24 * 60) {
      this.minutes -= 24 * 60;
      this.day++;
    }

    this.dispatchBuildings(dt);

    this.spawnGuests(dt);
    updateGuests(this, dt);
  }

  // Load / dispatch / run, once per building per tick.
  //
  // A vehicle fills up to its capacity and then departs together. Without
  // this, a ride serves one guest per cycle however large it is, and rated
  // capacity means nothing — an eight-seat carousel then moves eight times
  // fewer people than its own catalogue entry claims.
  dispatchBuildings(dt) {
    for (const building of this.buildings) {
      if (!building.active) continue;
      const spec = building.spec;

      if (building.busyTimer > 0) {
        building.busyTimer -= dt;
        if (building.busyTimer <= 0) {
          building.busyTimer = 0;
          building.loaded = 0;
          building.dwell = 0;
        }
        continue;
      }

      if (building.loaded <= 0) continue;

      // Depart when full, or after a short dwell so a half-empty vehicle is
      // not held hostage waiting for riders who may never turn up.
      building.dwell += dt;
      if (building.loaded >= spec.capacity || building.dwell >= spec.loadSeconds) {
        building.busyTimer = spec.rideSeconds;
      }
    }
  }

  // Arrivals scale with reputation. A park nobody rates still gets a trickle,
  // or a bad opening day would be unrecoverable.
  spawnGuests(dt) {
    const hour = this.minutes / 60;
    if (hour < 9 || hour > 21) return;

    // Tuned against a measured day: the old rate drew ~1400 guests to a
    // three-building park, which no starter layout can serve, so every park
    // looked like a failing one. Reputation still drives growth, but a small
    // park now gets a crowd it has a chance of satisfying.
    const perMinute = 0.15 + (this.rating / 1000) * 1.2;
    this.spawnAccumulator += perMinute * dt * MINUTES_PER_SECOND;

    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      if (this.guests.length >= 400) break; // keep the frame budget sane
      const guest = new Guest(this.entrance.gx, this.entrance.gy);
      if (guest.cash < this.entranceFee) continue; // priced out, turns around
      guest.cash -= this.entranceFee;
      this.money += this.entranceFee;
      this.stats.revenue += this.entranceFee;
      this.stats.admitted++;
      this.guests.push(guest);
    }
  }

  recordDeparture(guest) {
    this.stats.happinessSum += guest.happiness;
    this.stats.happinessSamples++;
  }

  // --- persistence ------------------------------------------------------

  serialize() {
    return {
      version: 1,
      name: this.name,
      money: this.money,
      minutes: this.minutes,
      day: this.day,
      entranceFee: this.entranceFee,
      entrance: this.entrance,
      grid: this.grid.serialize(),
      stats: this.stats,
      buildings: this.buildings.map((b) => ({
        id: b.id,
        itemId: b.itemId,
        gx: b.gx,
        gy: b.gy,
        active: b.active,
        totalCustomers: b.totalCustomers,
        revenue: b.revenue,
      })),
    };
  }

  static deserialize(data) {
    const park = new Park(data.name);
    park.money = data.money;
    park.minutes = data.minutes;
    park.day = data.day;
    park.entranceFee = data.entranceFee ?? 12;
    park.entrance = data.entrance;
    park.grid = Grid.deserialize(data.grid);
    park.stats = Object.assign(park.stats, data.stats || {});

    park.buildings = (data.buildings || []).map((b) => {
      const spec = itemById(b.itemId);
      return {
        id: b.id,
        itemId: b.itemId,
        spec,
        gx: b.gx,
        gy: b.gy,
        w: spec.footprint.w,
        h: spec.footprint.h,
        queue: [],
        busyTimer: 0,
        loaded: 0,
        dwell: 0,
        totalCustomers: b.totalCustomers || 0,
        revenue: b.revenue || 0,
        active: b.active !== false,
      };
    });

    // Guests are deliberately not saved. They are transient, they would bloat
    // the payload, and a park reloading to a clean opening is not a loss.
    park.guests = [];
    park.rebuildAccess();
    return park;
  }
}

export { NEED };
