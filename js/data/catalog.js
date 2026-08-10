// Everything buildable, in one place.
//
// Rides and shops share a shape so the placement code, the renderer and the
// guest simulation can all treat them as one kind of thing. What separates
// them is `satisfies`: which guest need consuming this actually relieves.

export const NEED = {
  FUN: 'fun',
  HUNGER: 'hunger',
  THIRST: 'thirst',
};

export const CATALOG = {
  path: {
    id: 'path',
    name: 'Footpath',
    kind: 'path',
    cost: 12,
    footprint: { w: 1, h: 1 },
    colour: '#8d8378',
  },

  carousel: {
    id: 'carousel',
    name: 'Carousel',
    kind: 'ride',
    cost: 1400,
    footprint: { w: 2, h: 2 },
    height: 34,
    colour: '#c9598f',
    roof: '#e78bb4',
    price: 2.0,
    capacity: 8,
    rideSeconds: 12,
    loadSeconds: 3,
    excitement: 3.2,
    intensity: 1.1,
    satisfies: NEED.FUN,
    // How much of the need one go relieves, 0..1.
    relief: 0.45,
  },

  teacups: {
    id: 'teacups',
    name: 'Spinning Teacups',
    kind: 'ride',
    cost: 1900,
    footprint: { w: 2, h: 2 },
    height: 26,
    colour: '#5b8ec9',
    roof: '#8dbbe7',
    price: 2.5,
    capacity: 6,
    rideSeconds: 14,
    loadSeconds: 3,
    excitement: 4.1,
    intensity: 3.4,
    satisfies: NEED.FUN,
    relief: 0.55,
  },

  droptower: {
    id: 'droptower',
    name: 'Drop Tower',
    kind: 'ride',
    cost: 4200,
    footprint: { w: 2, h: 2 },
    height: 96,
    colour: '#c2683a',
    roof: '#f0a86c',
    price: 4.5,
    capacity: 4,
    rideSeconds: 18,
    loadSeconds: 4,
    excitement: 7.6,
    intensity: 7.9,
    satisfies: NEED.FUN,
    relief: 0.85,
  },

  burgers: {
    id: 'burgers',
    name: 'Burger Stand',
    kind: 'shop',
    cost: 800,
    footprint: { w: 1, h: 1 },
    height: 28,
    colour: '#b8893c',
    roof: '#e0b968',
    price: 5.5,
    capacity: 3,
    rideSeconds: 8,
    loadSeconds: 1,
    satisfies: NEED.HUNGER,
    relief: 0.9,
  },

  drinks: {
    id: 'drinks',
    name: 'Drink Stall',
    kind: 'shop',
    cost: 650,
    footprint: { w: 1, h: 1 },
    height: 26,
    colour: '#3f9e8c',
    roof: '#71cbb8',
    price: 3.0,
    capacity: 3,
    rideSeconds: 6,
    loadSeconds: 1,
    satisfies: NEED.THIRST,
    relief: 0.9,
  },
};

export const BUILD_ITEMS = [
  CATALOG.path,
  CATALOG.carousel,
  CATALOG.teacups,
  CATALOG.droptower,
  CATALOG.burgers,
  CATALOG.drinks,
];

export function itemById(id) {
  return CATALOG[id] || null;
}
