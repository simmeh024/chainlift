// Save/load against the PHP API.
//
// The simulation runs entirely in the browser and the server only ever stores
// a blob. That is the right split for a single-player sandbox: the sim needs
// to run at 30Hz, which no shared-hosting PHP process should be asked to do,
// and there is nothing to cheat at. Anything competitive would need to move
// server-side.

const API = './api';

// There are no accounts in v0. A park belongs to an opaque token this browser
// generated and keeps; the server stores a sandbox save and nothing personal,
// so requiring a sign-up would be a barrier with nothing behind it.
function playerToken() {
  let token = localStorage.getItem('chainlift:player');
  if (!token) {
    token = (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem('chainlift:player', token);
  }
  return token;
}

async function request(path, options) {
  const join = path.includes('?') ? '&' : '?';
  const response = await fetch(`${API}/${path}${join}player=${encodeURIComponent(playerToken())}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Server returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok || data.error) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function savePark(park, slot = 'autosave') {
  return request('park/save.php', {
    method: 'POST',
    body: JSON.stringify({ slot, state: park.serialize() }),
  });
}

export async function loadPark(slot = 'autosave') {
  return request(`park/load.php?slot=${encodeURIComponent(slot)}`, { method: 'GET' });
}

// Local fallback, so the game is playable before the database exists and if
// the network is down mid-session. A save that only ever lived on the server
// is a save you can lose to a 500.
export function saveLocal(park, slot = 'autosave') {
  localStorage.setItem(`chainlift:${slot}`, JSON.stringify(park.serialize()));
}

export function loadLocal(slot = 'autosave') {
  const raw = localStorage.getItem(`chainlift:${slot}`);
  return raw ? JSON.parse(raw) : null;
}
