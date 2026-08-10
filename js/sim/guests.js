// Guests.
//
// Each guest is a small state machine walking the path network. Needs decay
// steadily; whichever need is most urgent decides what they go looking for.
// When nothing is urgent they wander, which is what makes a park look alive
// rather than like a queue simulator.

import { NEED } from '../data/catalog.js';
import { findPath, randomStep } from './pathfinding.js';

export const STATE = {
  WALKING: 'walking',
  QUEUING: 'queuing',
  CONSUMING: 'consuming',
  LEAVING: 'leaving',
  GONE: 'gone',
};

// Per-second decay.
//
// Tuned against measured throughput rather than by feel. A ride serving
// `capacity` guests every (rideSeconds + loadSeconds) supports roughly
// relief/decay * throughput guests before a queue runs away. At the original
// rates one carousel sustained about 21 guests, so every park was permanently
// oversubscribed and building more rides could never catch up. These rates put
// one ride at roughly 60 guests, which makes adding a second one feel like it
// solved something.
const DECAY = {
  [NEED.FUN]: 0.004,
  [NEED.HUNGER]: 0.003,
  [NEED.THIRST]: 0.004,
};

const WALK_SPEED = 1.7; // tiles per second
const PATIENCE_SECONDS = 45; // how long a guest will queue before giving up

let nextGuestId = 1;

export class Guest {
  constructor(gx, gy) {
    this.id = nextGuestId++;
    this.gx = gx;
    this.gy = gy;
    this.rx = gx; // smoothed render position
    this.ry = gy;

    this.needs = {
      [NEED.FUN]: 0.75 + Math.random() * 0.2,
      [NEED.HUNGER]: 0.7 + Math.random() * 0.25,
      [NEED.THIRST]: 0.7 + Math.random() * 0.25,
    };

    this.cash = 30 + Math.random() * 60;
    this.happiness = 0.7;
    this.state = STATE.WALKING;
    this.path = null;
    this.pathStep = 0;
    this.stepProgress = 0;
    this.targetBuilding = null;
    this.timer = 0;
    this.queueTime = 0;
    this.hue = Math.floor(Math.random() * 360);
    this.spent = 0;

    // How willing this guest is to walk past the first thing that would do.
    // Without it every guest takes the nearest option, so whatever sits by the
    // gate is mobbed and the far end of the park is never visited at all.
    this.wanderlust = 0.15 + Math.random() * 0.35;
  }

  get urgentNeed() {
    let worst = null;
    let worstValue = Infinity;
    for (const key of Object.keys(this.needs)) {
      if (this.needs[key] < worstValue) {
        worstValue = this.needs[key];
        worst = key;
      }
    }
    return { need: worst, value: worstValue };
  }

  decayNeeds(dt) {
    for (const key of Object.keys(this.needs)) {
      this.needs[key] = Math.max(0, this.needs[key] - DECAY[key] * dt);
    }

    // Happiness tracks the worst unmet need, so a guest who is having a great
    // time but is parched still reads as unhappy — which is the signal the
    // player needs in order to notice the missing drink stall.
    const worst = this.urgentNeed.value;
    const target = Math.min(1, worst + 0.15);
    this.happiness += (target - this.happiness) * Math.min(1, dt * 0.25);
    this.happiness = Math.max(0, Math.min(1, this.happiness));
  }

  // Advance along the current path. Returns true on arrival.
  advance(dt) {
    if (!this.path || this.pathStep >= this.path.length - 1) return true;

    this.stepProgress += WALK_SPEED * dt;
    while (this.stepProgress >= 1) {
      this.stepProgress -= 1;
      this.pathStep++;
      if (this.pathStep >= this.path.length - 1) {
        const last = this.path[this.path.length - 1];
        this.gx = last.gx;
        this.gy = last.gy;
        this.rx = last.gx;
        this.ry = last.gy;
        this.stepProgress = 0;
        return true;
      }
    }

    const from = this.path[this.pathStep];
    const to = this.path[Math.min(this.pathStep + 1, this.path.length - 1)];
    this.gx = from.gx;
    this.gy = from.gy;
    this.rx = from.gx + (to.gx - from.gx) * this.stepProgress;
    this.ry = from.gy + (to.gy - from.gy) * this.stepProgress;
    return false;
  }

  setPath(path) {
    this.path = path;
    this.pathStep = 0;
    this.stepProgress = 0;
  }
}

// One simulation step for every guest in the park.
export function updateGuests(park, dt) {
  const survivors = [];

  for (const guest of park.guests) {
    guest.decayNeeds(dt);

    switch (guest.state) {
      case STATE.WALKING:
        stepWalking(park, guest, dt);
        break;
      case STATE.QUEUING:
        stepQueuing(park, guest, dt);
        break;
      case STATE.CONSUMING:
        stepConsuming(park, guest, dt);
        break;
      case STATE.LEAVING:
        stepLeaving(park, guest, dt);
        break;
    }

    if (guest.state !== STATE.GONE) survivors.push(guest);
    else park.stats.departed++;
  }

  park.guests = survivors;
}

function stepWalking(park, guest, dt) {
  const arrived = guest.advance(dt);
  if (!arrived) return;

  // Arrived at a queue tile for the building we set out for.
  if (guest.targetBuilding !== null) {
    const building = park.buildings[guest.targetBuilding];
    if (building && building.active) {
      guest.state = STATE.QUEUING;
      guest.queueTime = 0;
      building.queue.push(guest.id);
      return;
    }
    guest.targetBuilding = null;
  }

  decideNextGoal(park, guest);
}

function decideNextGoal(park, guest) {
  // Out of money or thoroughly miserable: go home.
  if (guest.cash < 3 || guest.happiness < 0.18) {
    startLeaving(park, guest);
    return;
  }

  const { need, value } = guest.urgentNeed;

  // Only go hunting once a need actually bites. Above this the guest mooches
  // around, which is both more lifelike and much cheaper than pathfinding
  // every guest every time they finish something.
  if (value < 0.6) {
    const target = park.findNearestAccess(guest, need, guest.cash);
    if (target) {
      guest.targetBuilding = target.buildingId;
      guest.setPath(target.path);
      guest.state = STATE.WALKING;
      return;
    }
    // Nothing available for the need they care most about. That is a real
    // failure of the park, and it should cost the player.
    guest.happiness = Math.max(0, guest.happiness - 0.04);
  }

  const step = randomStep(park.grid, { gx: guest.gx, gy: guest.gy });
  if (step) {
    guest.targetBuilding = null;
    guest.setPath([{ gx: guest.gx, gy: guest.gy }, step]);
    guest.state = STATE.WALKING;
  }
}

function stepQueuing(park, guest, dt) {
  const building = park.buildings[guest.targetBuilding];
  if (!building || !building.active) {
    leaveQueue(park, guest);
    decideNextGoal(park, guest);
    return;
  }

  guest.queueTime += dt;

  // A guest who has waited too long gives up and thinks less of the park.
  if (guest.queueTime > PATIENCE_SECONDS) {
    leaveQueue(park, guest);
    guest.happiness = Math.max(0, guest.happiness - 0.12);
    decideNextGoal(park, guest);
    return;
  }

  const spec = building.spec;

  // Mid-cycle: the ride is running and nobody boards.
  if (building.busyTimer > 0) return;
  // This cycle's vehicle is already full; wait for the next one.
  if (building.loaded >= spec.capacity) return;
  // Only the front of the queue is eligible to board.
  if (building.queue.indexOf(guest.id) >= spec.capacity) return;

  if (guest.cash < spec.price) {
    leaveQueue(park, guest);
    decideNextGoal(park, guest);
    return;
  }

  // Pay and board.
  guest.cash -= spec.price;
  guest.spent += spec.price;
  park.money += spec.price;
  park.stats.revenue += spec.price;
  building.totalCustomers++;
  building.revenue += spec.price;

  leaveQueue(park, guest);
  guest.state = STATE.CONSUMING;
  guest.timer = spec.rideSeconds;

  // Boarding fills the vehicle; the park is what decides when it departs, so
  // that a full load leaves together rather than one guest at a time.
  building.loaded++;
}

function leaveQueue(park, guest) {
  const building = park.buildings[guest.targetBuilding];
  if (!building) return;
  const at = building.queue.indexOf(guest.id);
  if (at !== -1) building.queue.splice(at, 1);
}

function stepConsuming(park, guest, dt) {
  guest.timer -= dt;
  if (guest.timer > 0) return;

  const building = park.buildings[guest.targetBuilding];
  if (building) {
    const spec = building.spec;
    guest.needs[spec.satisfies] = Math.min(1, guest.needs[spec.satisfies] + spec.relief);

    // Intensity is a matching problem, not a bonus: a mild guest on a violent
    // ride enjoys it less, and the reverse is merely dull.
    if (spec.kind === 'ride') {
      const enjoyment = spec.excitement / 10 - Math.max(0, spec.intensity - 6) * 0.06;
      guest.happiness = Math.max(0, Math.min(1, guest.happiness + enjoyment * 0.25));
    } else {
      guest.happiness = Math.min(1, guest.happiness + 0.05);
    }
  }

  guest.targetBuilding = null;
  guest.state = STATE.WALKING;
  decideNextGoal(park, guest);
}

function startLeaving(park, guest) {
  const path = findPath(park.grid, { gx: guest.gx, gy: guest.gy }, (gx, gy) => {
    return gx === park.entrance.gx && gy === park.entrance.gy;
  });

  guest.state = STATE.LEAVING;
  if (path) guest.setPath(path);
  else guest.state = STATE.GONE; // stranded, e.g. the player deleted their path
}

function stepLeaving(park, guest, dt) {
  if (guest.advance(dt)) {
    guest.state = STATE.GONE;
    park.recordDeparture(guest);
  }
}
