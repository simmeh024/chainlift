// HUD: the always-visible readout of how the park is doing.

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

export class Hud {
  constructor(root) {
    this.el = {
      money: root.querySelector('#hud-money'),
      guests: root.querySelector('#hud-guests'),
      rating: root.querySelector('#hud-rating'),
      happiness: root.querySelector('#hud-happiness'),
      clock: root.querySelector('#hud-clock'),
      day: root.querySelector('#hud-day'),
      bar: root.querySelector('#hud-rating-bar'),
    };
    this.lastRating = -1;
  }

  update(park) {
    this.el.money.textContent = money(park.money);
    this.el.money.classList.toggle('is-negative', park.money < 0);
    this.el.guests.textContent = park.guests.length;
    this.el.clock.textContent = park.clock;
    this.el.day.textContent = 'Day ' + park.day;

    const rating = park.rating;
    if (rating !== this.lastRating) {
      this.el.rating.textContent = rating;
      this.el.bar.style.width = (rating / 10) + '%';
      this.el.bar.classList.toggle('is-poor', rating < 350);
      this.el.bar.classList.toggle('is-good', rating >= 650);
      this.lastRating = rating;
    }

    const happy = park.guests.length > 0 ? Math.round(park.averageHappiness * 100) : null;
    this.el.happiness.textContent = happy === null ? '—' : happy + '%';
  }
}

// Transient message line, for build errors and save confirmations.
export class Toast {
  constructor(el) {
    this.el = el;
    this.timer = null;
  }

  show(text, tone = 'info') {
    this.el.textContent = text;
    this.el.dataset.tone = tone;
    this.el.classList.add('is-visible');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.remove('is-visible'), 2600);
  }
}
