// Inspector and finance panels.
//
// The simulation knew everything on these panels already; none of it reached
// the screen. A park that was failing looked the same as one that was thriving
// apart from a number going down, and the only way to find out why was to read
// the source.

import { currentThought, moodLabel } from '../sim/thoughts.js';
import { NEED } from '../data/catalog.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (n) => Math.round(n * 100) + '%';

const NEED_NAME = {
  [NEED.FUN]: 'Fun',
  [NEED.HUNGER]: 'Food',
  [NEED.THIRST]: 'Drink',
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function bar(label, value, tone) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return `
    <div class="meter">
      <span class="meter-label">${escapeHtml(label)}</span>
      <span class="meter-track"><span class="meter-fill" data-tone="${tone}" style="width:${width}%"></span></span>
      <span class="meter-value">${pct(value)}</span>
    </div>`;
}

function needTone(value) {
  if (value > 0.6) return 'good';
  if (value > 0.3) return 'warn';
  return 'bad';
}

export class Inspector {
  constructor(el) {
    this.el = el;
    this.target = null;   // { kind: 'guest'|'building', ref }
    this.el.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) this.clear();
    });
  }

  select(kind, ref) {
    this.target = { kind, ref };
    this.el.hidden = false;
  }

  clear() {
    this.target = null;
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  // Called from the render loop. A selected thing that has left the park or
  // been demolished closes the panel rather than freezing on stale numbers.
  refresh(park) {
    if (!this.target) return;

    if (this.target.kind === 'guest') {
      if (!park.guests.includes(this.target.ref)) return this.clear();
      this.el.innerHTML = this.guestMarkup(this.target.ref);
    } else {
      if (!this.target.ref.active) return this.clear();
      this.el.innerHTML = this.buildingMarkup(park, this.target.ref);
    }
  }

  guestMarkup(guest) {
    const thought = currentThought(guest);
    const history = (guest.thoughts || []).slice(1);

    return `
      <div class="panel-head">
        <div>
          <span class="panel-eyebrow">Guest #${guest.id}</span>
          <h3 class="panel-title">${escapeHtml(moodLabel(guest.happiness))}</h3>
        </div>
        <button type="button" class="panel-close" data-close aria-label="Close">&times;</button>
      </div>

      <p class="thought" data-tone="${thought.tone}">&ldquo;${escapeHtml(thought.text)}&rdquo;</p>

      ${bar('Happiness', guest.happiness, needTone(guest.happiness))}
      ${Object.keys(guest.needs).map((k) =>
        bar(NEED_NAME[k] || k, guest.needs[k], needTone(guest.needs[k]))).join('')}

      <dl class="facts">
        <div><dt>Cash left</dt><dd>${money(guest.cash)}</dd></div>
        <div><dt>Spent here</dt><dd>${money(guest.spent)}</dd></div>
        <div><dt>Doing</dt><dd>${escapeHtml(guest.state)}</dd></div>
      </dl>

      ${history.length ? `<div class="panel-sub">Earlier</div>
        <ul class="thought-log">
          ${history.map((t) => `<li data-tone="${t.tone}">${escapeHtml(t.text)}</li>`).join('')}
        </ul>` : ''}
    `;
  }

  buildingMarkup(park, building) {
    const s = park.buildingStats(building);
    const spec = building.spec;
    // Utilisation is what the ride actually moved against what it could have.
    // A long queue with low utilisation means the problem is reachability,
    // not capacity — which is a different fix entirely.
    const utilisation = s.capacityPerHour > 0
      ? Math.min(1, s.ridersPerHour / s.capacityPerHour) : 0;

    return `
      <div class="panel-head">
        <div>
          <span class="panel-eyebrow">${spec.kind === 'ride' ? 'Ride' : 'Shop'}</span>
          <h3 class="panel-title">${escapeHtml(spec.name)}</h3>
        </div>
        <button type="button" class="panel-close" data-close aria-label="Close">&times;</button>
      </div>

      ${bar('Utilisation', utilisation, utilisation > 0.6 ? 'good' : utilisation > 0.25 ? 'warn' : 'bad')}

      <dl class="facts">
        <div><dt>Queue</dt><dd>${s.queue}</dd></div>
        <div><dt>Served</dt><dd>${s.served.toLocaleString('en-US')}</dd></div>
        <div><dt>Riders/hr</dt><dd>${s.ridersPerHour.toFixed(1)}</dd></div>
        <div><dt>Capacity/hr</dt><dd>${Math.round(s.capacityPerHour)}</dd></div>
        <div><dt>Income</dt><dd>${money(s.revenue)}</dd></div>
        <div><dt>Income/hr</dt><dd>${money(s.perHour)}</dd></div>
        <div><dt>Ticket</dt><dd>${money(spec.price)}</dd></div>
        <div><dt>Built for</dt><dd>${money(s.cost)}</dd></div>
      </dl>

      <p class="payback ${s.paidBack ? 'is-good' : ''}">
        ${s.paidBack
          ? 'Has paid for itself.'
          : `${money(s.cost - s.revenue)} still to earn back.`}
      </p>

      ${spec.kind === 'ride' ? `<dl class="facts">
        <div><dt>Excitement</dt><dd>${spec.excitement.toFixed(1)}</dd></div>
        <div><dt>Intensity</dt><dd>${spec.intensity.toFixed(1)}</dd></div>
      </dl>` : ''}
    `;
  }
}

// --- finance -------------------------------------------------------------

export class FinanceScreen {
  constructor(el) {
    this.el = el;
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el || event.target.closest('[data-close]')) this.hide();
    });
  }

  get open() { return !this.el.hidden; }

  show(park) { this.el.hidden = false; this.render(park); }
  hide() { this.el.hidden = true; }
  toggle(park) { this.open ? this.hide() : this.show(park); }

  render(park) {
    const days = park.finance.slice(-14);
    const rides = park.buildings
      .filter((b) => b.active)
      .map((b) => ({ b, s: park.buildingStats(b) }))
      .sort((a, x) => x.s.revenue - a.s.revenue);

    // Scale bars against the largest absolute daily figure so profit and loss
    // share one axis and can be compared directly.
    const peak = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.spend)));

    this.el.innerHTML = `
      <div class="sheet" role="dialog" aria-label="Finances">
        <div class="panel-head">
          <div>
            <span class="panel-eyebrow">Day ${park.day}</span>
            <h3 class="panel-title">Finances</h3>
          </div>
          <button type="button" class="panel-close" data-close aria-label="Close">&times;</button>
        </div>

        <dl class="facts facts--wide">
          <div><dt>Cash</dt><dd>${money(park.money)}</dd></div>
          <div><dt>Total income</dt><dd>${money(park.stats.revenue)}</dd></div>
          <div><dt>Total spend</dt><dd>${money(park.stats.spend)}</dd></div>
          <div><dt>Today</dt><dd>${money(park.today.revenue - park.today.spend)}</dd></div>
        </dl>

        <div class="panel-sub">Last ${days.length || 0} completed day${days.length === 1 ? '' : 's'}</div>
        ${days.length === 0
          ? `<p class="empty">No completed days yet. The books close at midnight.</p>`
          : `<div class="chart">
              ${days.map((d) => `
                <div class="chart-col" title="Day ${d.day}: income ${money(d.revenue)}, spend ${money(d.spend)}">
                  <span class="chart-bar is-income" style="height:${(d.revenue / peak) * 100}%"></span>
                  <span class="chart-bar is-spend" style="height:${(d.spend / peak) * 100}%"></span>
                </div>`).join('')}
            </div>
            <div class="chart-axis">
              ${days.map((d) => `<span>${d.day}</span>`).join('')}
            </div>
            <div class="chart-key">
              <span><i class="is-income"></i>Income</span>
              <span><i class="is-spend"></i>Spend</span>
            </div>`}

        <div class="panel-sub">By attraction</div>
        ${rides.length === 0
          ? `<p class="empty">Nothing built yet.</p>`
          : `<table class="ledger">
              <thead><tr><th>Attraction</th><th>Served</th><th>Income</th><th>Per hour</th></tr></thead>
              <tbody>
                ${rides.map(({ b, s }) => `
                  <tr>
                    <td>${escapeHtml(b.spec.name)}${s.paidBack ? '' : ' <span class="tag">unpaid</span>'}</td>
                    <td>${s.served.toLocaleString('en-US')}</td>
                    <td>${money(s.revenue)}</td>
                    <td>${money(s.perHour)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>`;
  }
}
