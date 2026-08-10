// Breadth-first search across the walkable path network.
//
// BFS rather than A*: the park is small, every step costs the same, and BFS
// gives the genuinely shortest route with no heuristic to tune. It also
// answers "nearest thing of a kind" in one sweep, which is the question the
// guest simulation actually asks — a per-target A* would mean one search per
// candidate building.

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

// Walks outward from `start` until `isGoal(gx, gy)` is true. Returns the tile
// sequence from start to that goal inclusive, or null if it is unreachable.
export function findPath(grid, start, isGoal, maxNodes = 6000) {
  if (!grid.isWalkable(start.gx, start.gy)) return null;

  const startIdx = grid.index(start.gx, start.gy);
  const cameFrom = new Map();
  cameFrom.set(startIdx, -1);

  let queue = [start];
  let visited = 0;

  while (queue.length > 0) {
    const next = [];
    for (const cell of queue) {
      if (++visited > maxNodes) return null;

      if (isGoal(cell.gx, cell.gy)) {
        return reconstruct(grid, cameFrom, cell);
      }

      for (const dir of DIRS) {
        const nx = cell.gx + dir.dx;
        const ny = cell.gy + dir.dy;
        // canStep, not isWalkable: a path at the top of a cliff is walkable
        // but not reachable from down here.
        if (!grid.canStep(cell.gx, cell.gy, nx, ny)) continue;
        const idx = grid.index(nx, ny);
        if (cameFrom.has(idx)) continue;
        cameFrom.set(idx, grid.index(cell.gx, cell.gy));
        next.push({ gx: nx, gy: ny });
      }
    }
    queue = next;
  }
  return null;
}

function reconstruct(grid, cameFrom, goal) {
  const path = [];
  let idx = grid.index(goal.gx, goal.gy);
  while (idx !== -1 && idx !== undefined) {
    path.push({ gx: idx % grid.width, gy: Math.floor(idx / grid.width) });
    idx = cameFrom.get(idx);
  }
  return path.reverse();
}

// A random walkable neighbour, used when a guest has nowhere in particular to
// be. Wandering keeps guests visible on the paths instead of freezing in place
// the moment their needs are met.
export function randomStep(grid, from) {
  const options = DIRS
    .map((d) => ({ gx: from.gx + d.dx, gy: from.gy + d.dy }))
    .filter((c) => grid.canStep(from.gx, from.gy, c.gx, c.gy));
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}
