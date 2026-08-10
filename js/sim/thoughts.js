// What guests are thinking.
//
// The simulation already knows why a guest is unhappy — it decided the queue
// was too long, or that nothing on offer was affordable. None of that reached
// the player, so a failing park looked identical to a thriving one apart from
// a number going down. A thought is that reasoning said out loud.
//
// Thoughts are recorded at the moment a decision is made rather than derived
// afterwards, because by the time a guest is wandering again the reason they
// gave up has already been thrown away.

import { NEED } from '../data/catalog.js';

// Most recent thoughts kept per guest. Older ones fall off the end: a guest is
// interesting for what they think now, and an unbounded log per guest would
// grow without limit across a long day.
const MAX_THOUGHTS = 4;

export function think(guest, text, tone = 'neutral') {
  if (!guest.thoughts) guest.thoughts = [];
  // Never repeat the same thought twice in a row — a guest stuck in a loop
  // would otherwise fill their whole history with one line.
  const last = guest.thoughts[0];
  if (last && last.text === text) return;
  guest.thoughts.unshift({ text, tone });
  if (guest.thoughts.length > MAX_THOUGHTS) guest.thoughts.length = MAX_THOUGHTS;
}

const NEED_LABEL = {
  [NEED.FUN]: 'bored',
  [NEED.HUNGER]: 'hungry',
  [NEED.THIRST]: 'thirsty',
};

const NEED_WANT = {
  [NEED.FUN]: 'something to do',
  [NEED.HUNGER]: 'somewhere to eat',
  [NEED.THIRST]: 'a drink',
};

export function thoughtQueueTooLong(guest, name) {
  think(guest, `I gave up waiting for ${name}.`, 'bad');
}

export function thoughtTooExpensive(guest, name, price) {
  think(guest, `$${price.toFixed(2)} for ${name}? Not a chance.`, 'bad');
}

export function thoughtNothingFor(guest, need) {
  think(guest, `I'm ${NEED_LABEL[need]} and there's nowhere to go.`, 'bad');
}

export function thoughtEnjoyed(guest, name, enjoyment) {
  if (enjoyment > 0.55) think(guest, `${name} was brilliant!`, 'good');
  else if (enjoyment > 0.2) think(guest, `${name} was alright.`, 'neutral');
  else think(guest, `${name} was a bit dull.`, 'bad');
}

export function thoughtAte(guest, name) {
  think(guest, `That hit the spot.`, 'good');
}

export function thoughtBroke(guest) {
  think(guest, `I'm out of money. Time to go.`, 'bad');
}

export function thoughtMiserable(guest) {
  think(guest, `I'm not enjoying this park. I'm leaving.`, 'bad');
}

export function thoughtArrived(guest) {
  think(guest, `Right, what's good here?`, 'neutral');
}

// Falls back to describing the current situation when nothing has been
// recorded, so an inspected guest is never a blank panel.
export function currentThought(guest) {
  if (guest.thoughts && guest.thoughts.length) return guest.thoughts[0];
  const { need, value } = guest.urgentNeed;
  if (value < 0.4) return { text: `I could really do with ${NEED_WANT[need]}.`, tone: 'bad' };
  return { text: `Just having a look round.`, tone: 'neutral' };
}

// A short read on how the visit is going, for the inspector header.
export function moodLabel(happiness) {
  if (happiness >= 0.75) return 'Delighted';
  if (happiness >= 0.55) return 'Happy';
  if (happiness >= 0.35) return 'Unimpressed';
  if (happiness >= 0.2) return 'Fed up';
  return 'Miserable';
}
