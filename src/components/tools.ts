// The plate's drawing tools: points, sampling, contours and trajectories,
// shared by the library and by its figures from geometry.

export type Point = [number, number];

const { PI, sin, cos, floor } = Math;
const TAU = 2 * PI;

export function sample(from: number, to: number, steps: number, f: (t: number) => Point): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => f(from + ((to - from) * i) / steps));
}
export const polar = (radius: (angle: number) => number) => (angle: number): Point => [
  radius(angle) * cos(angle),
  radius(angle) * sin(angle),
];
export const ring = (cx: number, cy: number, radius: number, steps = 96): Point[] =>
  sample(0, TAU, steps, (a) => [cx + radius * cos(a), cy + radius * sin(a)]);

/**
 * The curve f(x, y) = 0 inside a box, by marching squares on an n-by-n
 * grid: each cell's crossings are joined, then the pieces are walked into
 * runs.
 */
export function contour(f: (x: number, y: number) => number, [x0, x1, y0, y1]: number[], n = 240): Point[][] {
  const w = n + 1;
  const [dx, dy] = [(x1 - x0) / n, (y1 - y0) / n];
  const v = new Float64Array(w * w);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) v[j * w + i] = f(x0 + i * dx, y0 + j * dy);
  // An edge is numbered by the node it leaves and its side, rightwards (0) or
  // upwards (1). A crossing on it is joined to at most two others.
  const links = new Int32Array(4 * w * w).fill(-1);
  const link = (a: number, b: number) => {
    links[2 * a + (links[2 * a] < 0 ? 0 : 1)] = b;
    links[2 * b + (links[2 * b] < 0 ? 0 : 1)] = a;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const node = j * w + i;
      const [a, b, c, d] = [v[node] > 0, v[node + 1] > 0, v[node + w + 1] > 0, v[node + w] > 0];
      if (a === b && b === c && c === d) continue;
      // The cell's bottom, right, top and left edges, where the curve crosses them.
      const hits: number[] = [];
      if (a !== b) hits.push(2 * node);
      if (b !== c) hits.push(2 * (node + 1) + 1);
      if (c !== d) hits.push(2 * (node + w));
      if (d !== a) hits.push(2 * node + 1);
      if (hits.length === 2) link(hits[0], hits[1]);
      if (hits.length === 4) {
        // A saddle: the centre says which pair of corners is joined.
        const centre = f(x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy) > 0;
        if (centre === a) { link(hits[0], hits[1]); link(hits[2], hits[3]); }
        else { link(hits[0], hits[3]); link(hits[1], hits[2]); }
      }
    }
  }
  const at = (key: number): Point => {
    const [node, side] = [key >> 1, key & 1];
    const [a, b] = [v[node], v[side ? node + w : node + 1]];
    const s = a / (a - b);
    return [x0 + ((node % w) + (1 - side) * s) * dx, y0 + (floor(node / w) + side * s) * dy];
  };
  const runs: Point[][] = [];
  const seen = new Uint8Array(2 * w * w);
  const walk = (start: number) => {
    const run: Point[] = [];
    let [key, last] = [start, start];
    while (key >= 0) {
      seen[key] = 1;
      run.push(at(key));
      last = key;
      const [a, b] = [links[2 * key], links[2 * key + 1]];
      key = a >= 0 && !seen[a] ? a : b >= 0 && !seen[b] ? b : -1;
    }
    if (run.length > 2 && (links[2 * last] === start || links[2 * last + 1] === start)) run.push(at(start));
    runs.push(run);
  };
  // Open pieces from their ends first, then the closed loops.
  for (let key = 0; key < 2 * w * w; key++) if (!seen[key] && links[2 * key] >= 0 && links[2 * key + 1] < 0) walk(key);
  for (let key = 0; key < 2 * w * w; key++) if (!seen[key] && links[2 * key] >= 0) walk(key);
  return runs;
}

/** A trajectory of the system s′ = f(s), by fourth-order Runge–Kutta. */
export function flow(f: (s: number[]) => number[], start: number[], dt: number, steps: number): number[][] {
  const out = [start];
  const along = (s: number[], k: number[], h: number) => s.map((v, i) => v + h * k[i]);
  let s = start;
  for (let n = 0; n < steps; n++) {
    const k1 = f(s);
    const k2 = f(along(s, k1, dt / 2));
    const k3 = f(along(s, k2, dt / 2));
    const k4 = f(along(s, k3, dt));
    s = s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    out.push(s);
  }
  return out;
}

/** The pieces of each run whose points pass a test. */
export function keep(runs: Point[][], test: (p: Point) => boolean): Point[][] {
  return runs.flatMap((run) => {
    const pieces: Point[][] = [[]];
    for (const p of run) {
      if (test(p)) pieces[pieces.length - 1].push(p);
      else if (pieces[pieces.length - 1].length) pieces.push([]);
    }
    return pieces.filter((piece) => piece.length > 1);
  });
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);