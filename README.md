# Chainlift

A browser-based theme park builder. Build paths, place rides and shops, and
watch guests arrive, queue, spend and (with luck) enjoy themselves.

**No build step.** Vanilla JavaScript with native ES modules, PHP 8.3 and
MariaDB. There is nothing to compile, bundle or install — the files in this
repo are the files that get served.

## Running it locally

Any static file server will do; ES modules will not load over `file://`.

```bash
python -m http.server 8777
```

Then open <http://localhost:8777>. Saving falls back to `localStorage`, so the
game is fully playable with no PHP and no database.

## Tests

Open <http://localhost:8777/tests/harness.html>. It imports the real modules —
nothing is reimplemented in the harness — and asserts grid rules, pathfinding,
build and demolish economics, ride throughput, a live simulated day, and
save/load round-tripping. The page title reports `OK n/n` or `FAIL n`.

## Architecture

| Path | What it does |
|---|---|
| `js/core/` | Isometric maths, tile grid, camera |
| `js/sim/` | Park state, guests, pathfinding — all the rules |
| `js/render/` | Canvas drawing, no sprites yet |
| `js/data/catalog.js` | Every buildable thing, in one place |
| `js/net/save.js` | Save/load, with a localStorage fallback |
| `api/` | PHP save/load endpoints |
| `sql/` | Migrations, applied in filename order |

**The simulation runs entirely in the browser.** The server only ever stores an
opaque blob. That is the right split for a single-player sandbox: the sim runs
at 30Hz, which no shared-hosting PHP process should be asked to do, and there is
nothing to cheat at. Anything competitive would have to move server-side.

### Notes worth keeping

- **One game minute passes per simulated second**, so a full day is 24 real
  minutes. Ride durations are in simulated seconds, not game minutes.
- **Rides board a whole vehicle per cycle.** Serving one guest per cycle makes
  rated capacity meaningless and runs every ride at a fraction of its stated
  throughput.
- **Guests have `wanderlust`** so they sometimes walk past the nearest
  attraction. Without it everything by the gate is mobbed and the far end of the
  park is never visited. The skip budget counts *buildings*, not access tiles —
  a ride bordering the path in two places would otherwise use it up alone.
- **Guests are not saved.** They are transient, they would bloat the payload,
  and reopening to a fresh morning is not a loss.

## Deployment

`deploy.php` and `migrate.php` are key-gated operations endpoints, so pushing to
`main` and releasing needs no manual clicking.

```
https://<host>/Chainlift/deploy.php?key=...     # git reset --hard origin/main
https://<host>/Chainlift/migrate.php?key=...    # apply pending sql/*.sql
```

Both keys live only in `/home/rdy3i6my40b0/chainlift-secrets/config.php`,
outside the web root — see `api/config.sample.php` for the shape. **This repo is
public: never commit real credentials.**

These two endpoints can pull code and alter the database. They are a deliberate
trade for a fast prototype loop, and both should be deleted once that phase is
over.
