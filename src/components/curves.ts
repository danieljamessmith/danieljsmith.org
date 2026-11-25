// The figure plate's library. Each curve is plain data: how to work out its
// runs of points in mathematical coordinates, how to frame them, and a
// caption. `frame` turns a curve into SVG path data on the 400-unit plate.

export type Point = [number, number];

export interface Curve {
  name: string;
  /** Equation lines as fixed markup (italics, superscripts), never user input. */
  lines: string[];
  /** Who and when, as the caption prints it. */
  credit: string;
  /** One short line of context under the credit. */
  note?: string;
  /** Unbroken runs of the curve, in mathematical coordinates, worked out when it is first drawn. */
  runs: () => Point[][];
  /** Points to mark on the curve, such as rational points. */
  dots?: () => Point[];
  /** Radius of a marked point in plate units. */
  dotRadius?: number;
  /** Grid cell of the origin, counted from the left and from the bottom (0 to 20). Default: the centre. */
  origin?: Point;
  /** Width of the plate in mathematical units. Default: as large as fits. */
  span?: number;
  /** Axes through the origin. Figures without them (fractals) are centred instead, unless they give a span. */
  axes?: boolean;
  /** Stroke width in plate units. */
  weight?: number;
  /** What sort of figure it is: the plate keeps two of a kind apart. */
  kind: 'classical' | 'roulette' | 'number' | 'fractal' | 'analysis' | 'dynamics' | 'physics' | 'envelope';
}

const { PI, sin, cos, tan, asin, sqrt, cbrt, exp, log, abs, floor, round, min, max, hypot, sign } = Math;
const TAU = 2 * PI;

function sample(from: number, to: number, steps: number, f: (t: number) => Point): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => f(from + ((to - from) * i) / steps));
}
const polar = (radius: (angle: number) => number) => (angle: number): Point => [
  radius(angle) * cos(angle),
  radius(angle) * sin(angle),
];
const ring = (cx: number, cy: number, radius: number, steps = 96): Point[] =>
  sample(0, TAU, steps, (a) => [cx + radius * cos(a), cy + radius * sin(a)]);

/**
 * The real points of y = c ± √f(x) for x in [x0, x1]: for y² = f(x), or a
 * curve with a y term once the square is completed. Each interval where
 * f ≥ 0 becomes one run, sampled more densely near the roots, where the
 * curve turns vertical.
 */
function cubic(f: (x: number) => number, x0: number, x1: number, c = 0, steps = 500): Point[][] {
  const grid = 4000;
  const real = (x: number) => f(x) >= 0;
  const roots: number[] = [];
  for (let i = 0; i < grid; i++) {
    let a = x0 + ((x1 - x0) * i) / grid;
    let b = x0 + ((x1 - x0) * (i + 1)) / grid;
    const realA = real(a);
    if (realA === real(b)) continue;
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2;
      if (real(m) === realA) a = m; else b = m;
    }
    roots.push(realA ? a : b);
  }
  const cuts = [x0, ...roots, x1];
  const runs: Point[][] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    if (!real((a + b) / 2)) continue;
    const rootA = i > 0;
    const rootB = i < cuts.length - 2;
    const xs = Array.from({ length: steps + 1 }, (_, j) => {
      const s = j / steps;
      const u = rootA && rootB ? (1 - cos(PI * s)) / 2 : rootA ? s * s : rootB ? 1 - (1 - s) ** 2 : s;
      return a + (b - a) * u;
    });
    const upper = xs.map((x): Point => [x, c + sqrt(max(f(x), 0))]);
    const lower = xs.map((x): Point => [x, c - sqrt(max(f(x), 0))]).reverse();
    if (rootA) runs.push([...lower, ...upper]);
    else if (rootB) runs.push([...upper, ...lower]);
    else runs.push(upper, lower);
  }
  return runs;
}

/**
 * The curve f(x, y) = 0 inside a box, by marching squares on an n-by-n
 * grid: each cell's crossings are joined, then the pieces are walked into
 * runs.
 */
function contour(f: (x: number, y: number) => number, [x0, x1, y0, y1]: number[], n = 240): Point[][] {
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

/** A turtle's walk along an L-system: the letters in `steps` move forwards, + and − turn. */
function lsystem(axiom: string, rules: Record<string, string>, depth: number, angle: number, steps = 'F'): Point[] {
  let word = axiom;
  for (let n = 0; n < depth; n++) word = [...word].map((c) => rules[c] ?? c).join('');
  let [x, y, a] = [0, 0, 0];
  const points: Point[] = [[0, 0]];
  for (const c of word) {
    if (c === '+') a += angle;
    else if (c === '-') a -= angle;
    else if (steps.includes(c)) points.push([(x += cos(a)), (y += sin(a))]);
  }
  return points;
}

/** Cut every corner of a polyline, so a path that revisits its corners never touches itself. */
function chamfer(points: Point[], cut = 0.25): Point[] {
  return points.slice(1).flatMap((b, k): Point[] => {
    const a = points[k];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    return [[a[0] + cut * dx, a[1] + cut * dy], [b[0] - cut * dx, b[1] - cut * dy]];
  });
}

/** A trajectory of the system s′ = f(s), by fourth-order Runge–Kutta. */
function flow(f: (s: number[]) => number[], start: number[], dt: number, steps: number): number[][] {
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

function koch(level: number): Point[] {
  let points: Point[] = [0, 1, 2, 3].map((k) => [cos(PI / 2 + (k * TAU) / 3), sin(PI / 2 + (k * TAU) / 3)]);
  for (let n = 0; n < level; n++) {
    const next: Point[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const [[ax, ay], b] = [points[i], points[i + 1]];
      const [dx, dy] = [(b[0] - ax) / 3, (b[1] - ay) / 3];
      // The new peak points outwards: a turn of −60° for this anticlockwise outline.
      const peak: Point = [ax + dx + dx * cos(PI / 3) + dy * sin(PI / 3), ay + dy - dx * sin(PI / 3) + dy * cos(PI / 3)];
      next.push([ax + dx, ay + dy], peak, [ax + 2 * dx, ay + 2 * dy], b);
    }
    points = next;
  }
  return points;
}

function hilbert(order: number): Point[] {
  const n = 2 ** order;
  return Array.from({ length: n * n }, (_, d): Point => {
    let [x, y, t] = [0, 0, d];
    for (let s = 1; s < n; s *= 2) {
      const rx = 1 & floor(t / 2);
      const ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) [x, y] = [s - 1 - x, s - 1 - y];
        [x, y] = [y, x];
      }
      [x, y, t] = [x + s * rx, y + s * ry, floor(t / 4)];
    }
    return [x, y];
  });
}

/** ζ(½ + it) as a point of the plane, by Borwein's alternating series. */
const zeta = (() => {
  const n = 80;
  const d = [1];
  for (let i = 0, term = 1 / n; i < n; i++) {
    term *= (4 * (n + i) * (n - i)) / ((2 * i + 1) * (2 * i + 2));
    d.push(d[i] + n * term);
  }
  const weights = d.slice(0, n).map((dk, k) => ((k % 2 ? -1 : 1) * (dk - d[n])) / (d[n] * sqrt(k + 1)));
  const logs = weights.map((_, k) => log(k + 1));
  return (t: number): Point => {
    let [re, im] = [0, 0];
    weights.forEach((wk, k) => { re += wk * cos(t * logs[k]); im -= wk * sin(t * logs[k]); });
    // Divide by −(1 − 2^(1−s)), where 2^(1−s) = √2 e^(−it ln 2).
    const [a, b] = [sqrt(2) * cos(t * log(2)) - 1, -sqrt(2) * sin(t * log(2))];
    const m = a * a + b * b;
    return [(re * a + im * b) / m, (im * a - re * b) / m];
  };
})();

/** The points 1, 2, 3, … of a square spiral outwards from the origin. */
function squareSpiral(count: number): Point[] {
  const points: Point[] = [[0, 0]];
  let [x, y, dx, dy, side] = [0, 0, 1, 0, 1];
  while (points.length < count) {
    for (let turn = 0; turn < 2; turn++) {
      for (let k = 0; k < side && points.length < count; k++) points.push([(x += dx), (y += dy)]);
      [dx, dy] = [-dy, dx];
    }
    side++;
  }
  return points;
}
const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let k = 2; k * k <= n; k++) if (n % k === 0) return false;
  return true;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** The circles of an Apollonian gasket inside the unit circle, largest first, as [x, y, radius]. */
function gasket(limit: number): number[][] {
  type Circle = [number, number, number]; // curvature, then centre
  const found: Circle[] = [[-1, 0, 0], [2, -0.5, 0], [2, 0.5, 0], [3, 0, 2 / 3]];
  // The other circle touching a, b and c, given one (d) that already does: Descartes' theorem.
  const fill = (a: Circle, b: Circle, c: Circle, d: Circle) => {
    const k = 2 * (a[0] + b[0] + c[0]) - d[0];
    if (k > limit) return;
    const e: Circle = [
      k,
      (2 * (a[0] * a[1] + b[0] * b[1] + c[0] * c[1]) - d[0] * d[1]) / k,
      (2 * (a[0] * a[2] + b[0] * b[2] + c[0] * c[2]) - d[0] * d[2]) / k,
    ];
    found.push(e);
    fill(a, b, e, c);
    fill(a, c, e, b);
    fill(b, c, e, a);
  };
  const [o, a, b, c] = found;
  fill(o, a, b, c);
  fill(o, a, c, b);
  fill(o, b, c, a);
  fill(a, b, c, o);
  return found.sort((p, q) => p[0] - q[0]).map(([k, x, y]) => [x, y, 1 / abs(k)]);
}

/** The pieces of each run whose points pass a test. */
function keep(runs: Point[][], test: (p: Point) => boolean): Point[][] {
  return runs.flatMap((run) => {
    const pieces: Point[][] = [[]];
    for (const p of run) {
      if (test(p)) pieces[pieces.length - 1].push(p);
      else if (pieces[pieces.length - 1].length) pieces.push([]);
    }
    return pieces.filter((piece) => piece.length > 1);
  });
}

/**
 * Streamlines past a Joukowski aerofoil. The flow past a circle through
 * z = 1, with the circulation that puts a stagnation point there, is
 * carried over by w = z + 1/z and turned so the stream runs level.
 */
function aerofoil(): Point[][] {
  const [cx, cy, attack] = [-0.12, 0.12, 0.16];
  const radius = hypot(1 - cx, cy);
  const circulation = 2 * radius * sin(attack + asin(cy / radius));
  const stream = (u: number, v: number) => {
    const [a, b] = [u - cx, v - cy];
    const d = a * a + b * b;
    return (b * cos(attack) - a * sin(attack)) * (1 - (radius * radius) / d) + circulation * log(sqrt(d) / radius);
  };
  const map = ([u, v]: Point): Point => {
    const d = u * u + v * v;
    const [a, b] = [u + u / d, v - v / d];
    return [a * cos(attack) + b * sin(attack), b * cos(attack) - a * sin(attack)];
  };
  const outside = ([u, v]: Point) => hypot(u - cx, v - cy) > radius * 1.004;
  const lines = Array.from({ length: 19 }, (_, c) => (c - 9) * 0.3 + 0.15).flatMap((level) =>
    keep(contour((u, v) => stream(u, v) - level, [-4, 4, -4, 4], 260), outside));
  return [ring(cx, cy, radius, 400), ...lines].map((run) => run.map(map));
}

/** The squares of a Pythagoras tree, each as a closed run. */
function pythagoras(depth: number, lean: number): Point[][] {
  const squares: Point[][] = [];
  const grow = (a: Point, b: Point, left: number) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const [c, d]: Point[] = [[b[0] - dy, b[1] + dx], [a[0] - dy, a[1] + dx]];
    squares.push([a, b, c, d, a]);
    if (!left) return;
    // The apex of a right triangle on the top side, leaning by the given angle.
    const [ex, ey] = [c[0] - d[0], c[1] - d[1]];
    const [co, si] = [cos(lean), sin(lean)];
    const apex: Point = [d[0] + co * (ex * co - ey * si), d[1] + co * (ex * si + ey * co)];
    grow(d, apex, left - 1);
    grow(apex, c, left - 1);
  };
  grow([0, 0], [1, 0], depth);
  return squares;
}

const i = (v: string) => `<i>${v}</i>`;
const sup = (v: string) => `<sup>${v}</sup>`;
const sub = (v: string) => `<sub>${v}</sub>`;
const [x, y, t, r, θ, z, n, k] = ['x', 'y', 't', 'r', 'θ', 'z', 'n', 'k'].map(i);

// The three bodies of the figure-eight orbit: positions, then velocities.
const eight = () => {
  const [px, py, vx, vy] = [0.97000436, -0.24308753, -0.93240737, -0.86473146];
  const pull = (s: number[]) => {
    const out = [s[6], s[7], s[8], s[9], s[10], s[11], 0, 0, 0, 0, 0, 0];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        if (a === b) continue;
        const [dx, dy] = [s[2 * b] - s[2 * a], s[2 * b + 1] - s[2 * a + 1]];
        const d3 = hypot(dx, dy) ** 3;
        out[6 + 2 * a] += dx / d3;
        out[7 + 2 * a] += dy / d3;
      }
    }
    return out;
  };
  return flow(pull, [px, py, -px, -py, 0, 0, -vx / 2, -vy / 2, -vx / 2, -vy / 2, vx, vy], 0.002, 3163);
};

// The restricted three-body problem's potential in the rotating frame, masses 1 − μ and μ.
const MU = 0.2;
const roche = (u: number, v: number) =>
  (u * u + v * v) / 2 + (1 - MU) / hypot(u + MU, v) + MU / hypot(u - 1 + MU, v);
/** The level of the potential at its saddle on the x-axis between a and b. */
function saddle(a: number, b: number): number {
  const slope = (u: number) => roche(u + 1e-6, 0) - roche(u - 1e-6, 0);
  for (let step = 0; step < 60; step++) {
    const m = (a + b) / 2;
    if (sign(slope(m)) === sign(slope(a))) a = m; else b = m;
  }
  return roche(a, 0);
}

// After the first, the figures are in date order: the plate numbers them as they stand here.
export const curves: Curve[] = [
  {
    name: 'Butterfly curve',
    lines: [`${r} = e${sup(`sin ${θ}`)} − 2 cos 4${θ}`, `+ sin${sup('5')}((2${θ} − π)/24)`],
    credit: 'Temple H. Fay, 1989',
    runs: () => [sample(0, 12 * PI, 3600, polar((a) => exp(sin(a)) - 2 * cos(4 * a) + sin((2 * a - PI) / 24) ** 5))],
    origin: [10, 9],
    weight: 0.9,
    kind: 'classical',
  },
  {
    name: 'Spiral of Theodorus',
    lines: [`√1, √2, √3, …, √17`],
    credit: 'After Theodorus of Cyrene, 5th century BC',
    note: 'Each right triangle stands on the last one’s hypotenuse',
    runs: () => {
      const rim: Point[] = [[1, 0]];
      for (let m = 1; m <= 16; m++) {
        const [a, b] = rim[m - 1];
        rim.push([a - b / sqrt(m), b + a / sqrt(m)]);
      }
      return [[[0, 0], rim[0]], ...rim.slice(1).map((p, m): Point[] => [rim[m], p, [0, 0]])];
    },
    axes: false,
    weight: 1.1,
    kind: 'classical',
  },
  {
    name: 'Conchoid of Nicomedes',
    lines: [`${r} = sec ${θ} ± 2`],
    credit: 'Nicomedes, c. 200 BC',
    note: 'Made to trisect the angle',
    runs: () => [
      sample(-1.45, 1.45, 800, polar((a) => 1 / cos(a) + 2)),
      sample(-1.45, 1.45, 800, polar((a) => 1 / cos(a) - 2)),
    ],
    origin: [8, 10],
    span: 10,
    weight: 1.4,
    kind: 'classical',
  },
  {
    name: 'Congruent number curve',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} − 25${x}`],
    credit: 'Fibonacci, 1225',
    note: '(−4, 6) gives a rational right triangle of area 5',
    runs: () => cubic((u) => u ** 3 - 25 * u, -10.5, 10.5),
    dots: () => [[-4, 6], [-4, -6]],
    span: 20,
    weight: 1.6,
    kind: 'number',
  },
  {
    name: 'Tusi couple',
    lines: ['A circle rolling inside', 'one twice its size'],
    credit: 'Nasir al-Din al-Tusi, 1247',
    note: 'A point on its rim moves along a straight line',
    runs: () => [ring(0, 0, 1, 240), [[-1, 0], [1, 0]], ...Array.from({ length: 12 }, (_, c) => ring(cos((PI * (c + 0.5)) / 12) / 2, sin((PI * (c + 0.5)) / 12) / 2, 0.5, 120))],
    dots: () => Array.from({ length: 12 }, (_, c): Point => [cos((PI * (c + 0.5)) / 12), 0]),
    dotRadius: 3,
    axes: false,
    weight: 0.9,
    kind: 'roulette',
  },
  {
    name: 'Fermat’s spiral',
    lines: [`${r}${sup('2')} = ${θ}`],
    credit: 'Pierre de Fermat, 1636',
    runs: () => [[
      ...sample(0, 6 * PI, 900, (a): Point => [-sqrt(a) * cos(a), -sqrt(a) * sin(a)]).reverse(),
      ...sample(0, 6 * PI, 900, (a): Point => [sqrt(a) * cos(a), sqrt(a) * sin(a)]),
    ]],
    weight: 1.2,
    kind: 'classical',
  },
  {
    name: 'Folium of Descartes',
    lines: [`${x}${sup('3')} + ${y}${sup('3')} = 3${x}${y}`],
    credit: 'René Descartes, 1638',
    runs: () => [sample(-PI / 4 + 0.01, (3 * PI) / 4 - 0.01, 1600, polar((a) => (3 * sin(a) * cos(a)) / (sin(a) ** 3 + cos(a) ** 3)))],
    origin: [9, 9],
    span: 6,
    weight: 1.6,
    kind: 'classical',
  },
  {
    name: 'Apollonian gasket',
    lines: ['Curvatures −1, 2, 2, 3, 3, 6, …'],
    credit: 'René Descartes, 1643',
    note: 'His circle theorem finds each circle from three that touch',
    runs: () => gasket(110).map(([u, v, radius]) => ring(u, v, radius, max(14, floor(radius * 160)))),
    axes: false,
    weight: 0.8,
    kind: 'number',
  },
  {
    name: 'Mordell curve',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} − 2`],
    credit: 'Claimed by Fermat, 1657',
    note: 'Its only integer points are (3, ±5)',
    runs: () => cubic((u) => u ** 3 - 2, -4, 8.6),
    dots: () => [[3, 5], [3, -5]],
    origin: [6, 10],
    span: 12,
    weight: 1.6,
    kind: 'number',
  },
  {
    name: 'Elliptic curve',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} − ${x}`],
    credit: 'Pierre de Fermat, publ. 1670',
    note: 'No rational right triangle has area 1',
    runs: () => cubic((u) => u ** 3 - u, -2.1, 2.1),
    span: 4,
    weight: 1.6,
    kind: 'number',
  },
  {
    name: 'Evolute of an ellipse',
    lines: ['The normals to an ellipse'],
    credit: 'Christiaan Huygens, 1673',
    note: 'They crowd along a second curve',
    runs: () => [
      ring(0, 0, 1).map(([u, v]): Point => [2 * u, 1.25 * v]),
      ...Array.from({ length: 96 }, (_, c): Point[] => {
        const a = (TAU * (c + 0.5)) / 96;
        const [px, py, nx, ny] = [2 * cos(a), 1.25 * sin(a), 1.25 * cos(a), 2 * sin(a)];
        const len = hypot(nx, ny);
        return [[px, py], [px - (3.4 * nx) / len, py - (3.4 * ny) / len]];
      }),
    ],
    axes: false,
    weight: 0.45,
    kind: 'envelope',
  },
  {
    name: 'Nephroid',
    lines: ['Parallel rays, reflected in a circle'],
    credit: 'Christiaan Huygens, 1678',
    note: 'Half of it shines inside a cup of tea in sunlight',
    runs: () => [
      ring(0, 0, 1, 180),
      ...Array.from({ length: 90 }, (_, c): Point[] => {
        const a = asin(-0.985 + (1.97 * c) / 89);
        return [[cos(a), sin(a)], [-cos(3 * a), -sin(3 * a)]];
      }),
    ],
    axes: false,
    weight: 0.45,
    kind: 'envelope',
  },
  {
    name: 'Cassini ovals',
    lines: [`|${z} − 1| |${z} + 1| = ${i('b')}${sup('2')}`],
    credit: 'Giovanni Cassini, 1680',
    note: 'His model for the Sun’s path about the Earth',
    runs: () => [0.7, 0.9, 1, 1.1, 1.3, 1.6].flatMap((b) => contour((u, v) => ((u - 1) ** 2 + v * v) * ((u + 1) ** 2 + v * v) - b ** 4, [-2.2, 2.2, -2.2, 2.2], 300)),
    weight: 1.1,
    kind: 'classical',
  },
  {
    name: 'Lemniscate of Bernoulli',
    lines: [`(${x}${sup('2')} + ${y}${sup('2')})${sup('2')} = ${x}${sup('2')} − ${y}${sup('2')}`],
    credit: 'Jakob Bernoulli, 1694',
    runs: () => [sample(0, TAU, 720, (s) => [cos(s) / (1 + sin(s) ** 2), (sin(s) * cos(s)) / (1 + sin(s) ** 2)])],
    weight: 1.6,
    kind: 'classical',
  },
  {
    name: 'Brachistochrone',
    lines: [`${x} = ${t} − sin ${t},`, `${y} = cos ${t} − 1`],
    credit: 'Johann Bernoulli, 1696',
    note: 'A cycloid: the curve of fastest descent',
    runs: () => [sample(0, TAU, 720, (s) => [s - sin(s), cos(s) - 1])],
    origin: [2, 13],
    span: 8,
    weight: 1.6,
    kind: 'roulette',
  },
  {
    name: 'Pentagram of Venus',
    lines: [`${z} = 0.72e${sup(`13${i('i')}${t}/8`)} − e${sup(`${i('i')}${t}`)}`],
    credit: 'Cassini, 1709',
    note: 'Eight years of Venus, as seen from the Earth',
    runs: () => [sample(0, 16 * PI, 2400, (s) => [0.7233 * cos((13 * s) / 8) - cos(s), 0.7233 * sin((13 * s) / 8) - sin(s)])],
    weight: 1.1,
    kind: 'physics',
  },
  {
    name: 'Rhodonea',
    lines: [`${r} = cos(7${θ}/4)`],
    credit: 'Guido Grandi, 1723',
    runs: () => [sample(0, 8 * PI, 1440, polar((a) => cos((7 * a) / 4)))],
    weight: 1.2,
    kind: 'roulette',
  },
  {
    name: 'Cardioid',
    lines: [`Chords from ${k} to 2${k}, of 200 points`],
    credit: 'Johann Castillon, 1741',
    note: 'He named it; drawing it with chords is due to Cremona',
    runs: () => Array.from({ length: 199 }, (_, c): Point[] => [c + 1, 2 * (c + 1)].map((m): Point => [-cos((TAU * m) / 200), sin((TAU * m) / 200)])),
    axes: false,
    weight: 0.4,
    kind: 'envelope',
  },
  {
    name: 'Euler spiral',
    lines: [`${x} = ∫ cos ½π${i('s')}${sup('2')} d${i('s')},`, `${y} = ∫ sin ½π${i('s')}${sup('2')} d${i('s')}`],
    credit: 'Leonhard Euler, 1744',
    note: 'Curvature grows with distance: the railway transition curve',
    runs: () => {
      const half: Point[] = [[0, 0]];
      const h = 5 / 2500;
      let [u, v] = [0, 0];
      for (let c = 0; c < 2500; c++) {
        const m = (c + 0.5) * h;
        half.push([(u += h * cos((PI * m * m) / 2)), (v += h * sin((PI * m * m) / 2))]);
      }
      return [[...half.map(([a, b]): Point => [-a, -b]).reverse(), ...half.slice(1)]];
    },
    weight: 1.1,
    kind: 'classical',
  },
  {
    name: 'Witch of Agnesi',
    lines: [`${y}(${x}${sup('2')} + 1) = 1`],
    credit: 'Maria Gaetana Agnesi, 1748',
    note: 'From her textbook of the calculus, Instituzioni analitiche',
    runs: () => [sample(-4, 4, 600, (u) => [u, 1 / (1 + u * u)]), ring(0, 0.5, 0.5)],
    origin: [10, 7],
    span: 5,
    weight: 1.4,
    kind: 'classical',
  },
  {
    name: 'Devil’s curve',
    lines: [`${y}${sup('4')} − ${x}${sup('4')} = 96${y}${sup('2')} − 100${x}${sup('2')}`],
    credit: 'Gabriel Cramer, 1750',
    runs: () => contour((u, v) => v ** 4 - u ** 4 - 96 * v * v + 100 * u * u, [-16, 16, -16, 16], 320),
    span: 32,
    weight: 1.4,
    kind: 'classical',
  },
  {
    name: 'Chladni figure',
    lines: [`cos 2π${x} cos 8π${y}`, `= cos 8π${x} cos 2π${y}`],
    credit: 'Ernst Chladni, 1787',
    note: 'Where sand settles on a plate bowed at its edge',
    runs: () => contour((u, v) => cos(2 * PI * u) * cos(8 * PI * v) - cos(8 * PI * u) * cos(2 * PI * v) + 1e-9, [0, 1, 0, 1], 300),
    axes: false,
    weight: 1.1,
    kind: 'physics',
  },
  {
    name: 'Lamé curves',
    lines: [`|${x}|${sup(n)} + |${y}|${sup(n)} = 1`],
    credit: 'Gabriel Lamé, 1818',
    note: 'n = ½, ⅔, 1, 1½, 2, 3, 6',
    runs: () => [0.5, 2 / 3, 1, 1.5, 2, 3, 6].map((p) => sample(0, TAU, 720, (a) => [sign(cos(a)) * abs(cos(a)) ** (2 / p), sign(sin(a)) * abs(sin(a)) ** (2 / p)])),
    weight: 1.1,
    kind: 'classical',
  },
  {
    name: 'Harmonograph',
    lines: [`${x} = e${sup(`−${t}/80`)} sin 3${t},`, `${y} = e${sup(`−${t}/80`)} sin(2.01${t} + ¼π)`],
    credit: 'After Hugh Blackburn, 1844',
    note: 'Two pendulums and a pen',
    runs: () => [sample(0, 190, 9000, (s) => [exp(-s / 80) * sin(3 * s), exp(-s / 80) * sin(2.01 * s + PI / 4)])],
    weight: 0.5,
    kind: 'roulette',
  },
  {
    name: 'Lissajous figure',
    lines: [`${x} = sin 3${t},`, `${y} = sin 4${t}`],
    credit: 'Jules Lissajous, 1857',
    note: 'Drawn by light off two tuning forks',
    runs: () => [sample(0, TAU, 720, (s) => [sin(3 * s), sin(4 * s)])],
    weight: 1.6,
    kind: 'roulette',
  },
  {
    name: 'Riemann zeta function',
    lines: [`ζ(½ + ${i('i')}${t}),`, `0 ≤ ${t} ≤ 50`],
    credit: 'Bernhard Riemann, 1859',
    note: 'Each pass through the origin is a zero on the critical line',
    runs: () => [sample(0, 50, 5000, zeta)],
    dots: () => [[0, 0]],
    origin: [7, 10],
    weight: 1,
    kind: 'analysis',
  },
  {
    name: 'Weierstrass function',
    lines: [`${y} = Σ 2${sup(`−${n}`)} cos(3${sup(n)}π${x})`],
    credit: 'Karl Weierstrass, 1872',
    note: 'Continuous everywhere, differentiable nowhere',
    runs: () => [sample(-1, 1, 6000, (u) => [u, 0.42 * Array.from({ length: 12 }, (_, m) => cos(3 ** m * PI * u) / 2 ** m).reduce((a, b) => a + b)])],
    weight: 0.8,
    kind: 'analysis',
  },
  {
    name: 'Zero-velocity curves',
    lines: ['The restricted three-body problem'],
    credit: 'George William Hill, 1878',
    note: 'Level curves of the potential in the rotating frame',
    runs: () => {
      const levels = [saddle(-MU + 0.05, 1 - MU - 0.05), saddle(1 - MU + 0.05, 2), saddle(-2, -MU - 0.05)];
      return [levels[0] + 0.25, ...levels, (levels[2] + 1.5 - (MU * (1 - MU)) / 2) / 2].flatMap((c) =>
        contour((u, v) => min(roche(u, v), 9) - c, [-2.1, 2.1, -2.1, 2.1], 320));
    },
    dots: () => [[-MU, 0], [1 - MU, 0]],
    dotRadius: 3,
    span: 4.2,
    axes: false,
    weight: 1,
    kind: 'dynamics',
  },
  {
    name: 'Devil’s staircase',
    lines: ['The Cantor function'],
    credit: 'Georg Cantor, 1884',
    note: 'It climbs from 0 to 1, yet is flat almost everywhere',
    runs: () => {
      const stairs = (x0: number, x1: number, y0: number, y1: number, depth: number): Point[] => {
        if (depth === 0) return [[x0, y0], [x1, y1]];
        const [a, b, m] = [x0 + (x1 - x0) / 3, x1 - (x1 - x0) / 3, (y0 + y1) / 2];
        return [...stairs(x0, a, y0, m, depth - 1), ...stairs(b, x1, m, y1, depth - 1)];
      };
      return [stairs(0, 1, 0, 1, 7)];
    },
    origin: [1, 1],
    span: 20 / 18,
    weight: 1.2,
    kind: 'analysis',
  },
  {
    name: 'Kelvin wake',
    lines: [`${x} = ${i('a')} cos${sup('2')}${θ} sin ${θ},`, `${y} = −${i('a')} cos ${θ} (1 + sin${sup('2')}${θ})`],
    credit: 'Lord Kelvin, 1887',
    note: 'A 39° wedge, whatever the speed',
    runs: () => Array.from({ length: 11 }, (_, c) => sample(-PI / 2, PI / 2, 400, (a): Point => [(c + 1) * cos(a) ** 2 * sin(a), -(c + 1) * cos(a) * (1 + sin(a) ** 2)])),
    dots: () => [[0, 0]],
    origin: [10, 18.4],
    span: 12.5,
    axes: false,
    weight: 1,
    kind: 'physics',
  },
  {
    name: 'Hilbert curve',
    lines: ['Order 4'],
    credit: 'David Hilbert, 1891',
    note: 'In the limit, it fills the square',
    runs: () => [hilbert(4)],
    axes: false,
    weight: 1.3,
    kind: 'fractal',
  },
  {
    name: 'Blancmange curve',
    lines: [`${y} = Σ 2${sup(`−${n}`)} ${i('s')}(2${sup(n)}${x})`],
    credit: 'Teiji Takagi, 1901',
    note: 'Nowhere differentiable; s is the distance to the nearest integer',
    runs: () => [sample(0, 1, 2048, (u) => [u, Array.from({ length: 14 }, (_, m) => abs(2 ** m * u - round(2 ** m * u)) / 2 ** m).reduce((a, b) => a + b)])],
    origin: [1, 4],
    span: 20 / 18,
    weight: 1,
    kind: 'analysis',
  },
  {
    name: 'Koch snowflake',
    lines: ['Fourth iteration'],
    credit: 'After Helge von Koch, 1904',
    note: 'In the limit: infinite perimeter, finite area',
    runs: () => [koch(4)],
    axes: false,
    weight: 1.1,
    kind: 'fractal',
  },
  {
    name: 'Joukowski aerofoil',
    lines: [`${i('w')} = ${z} + 1/${z}`],
    credit: 'Nikolai Zhukovsky, 1910',
    note: 'The flow past a circle, carried to a wing',
    runs: aerofoil,
    span: 7.4,
    axes: false,
    weight: 0.9,
    kind: 'physics',
  },
  {
    name: 'Rutherford scattering',
    lines: ['Alpha particles past a nucleus'],
    credit: 'Ernest Rutherford, 1911',
    note: 'Each path is a hyperbola',
    runs: () => [0.04, 0.13, 0.26, 0.43, 0.65, 0.92, 1.25, 1.65, 2.1, 2.6].flatMap((b) => [b, -b]).map((b) =>
      flow(([u, v, du, dv]) => { const d3 = hypot(u, v) ** 3; return [du, dv, (0.3 * u) / d3, (0.3 * v) / d3]; }, [-12, b, 1, 0], 0.01, 2600).map(([u, v]): Point => [u, v])),
    dots: () => [[0, 0]],
    origin: [8, 10],
    span: 8,
    axes: false,
    weight: 0.9,
    kind: 'physics',
  },
  {
    name: 'Sierpiński arrowhead curve',
    lines: ['Order 7'],
    credit: 'Wacław Sierpiński, 1915',
    note: 'One line that traces the Sierpiński triangle',
    runs: () => [lsystem('A', { A: 'B-A-B', B: 'A+B+A' }, 7, PI / 3, 'AB').map(([u, v]): Point => [u, -v])],
    axes: false,
    weight: 0.8,
    kind: 'fractal',
  },
  {
    name: 'Perihelion precession',
    lines: [`${r} = 1 / (1 + 0.6 cos 0.9${θ})`],
    credit: 'Albert Einstein, 1915',
    note: 'Relativity turns Mercury’s orbit 43″ a century; here, far more',
    runs: () => [sample(0, 20 * PI, 3000, polar((a) => 1 / (1 + 0.6 * cos(0.9 * a))))],
    dots: () => [[0, 0]],
    weight: 1,
    kind: 'physics',
  },
  {
    name: 'Taxicab curve',
    lines: [`${x}${sup('3')} + ${y}${sup('3')} = 1729`],
    credit: 'Hardy and Ramanujan, c. 1919',
    note: '1729 = 1³ + 12³ = 9³ + 10³',
    runs: () => [sample(-2.6, 13.8, 800, (u) => [u, cbrt(1729 - u ** 3)])],
    dots: () => [[1, 12], [9, 10], [10, 9], [12, 1]],
    origin: [3, 3],
    span: 16,
    weight: 1.6,
    kind: 'number',
  },
  {
    name: 'Lévy C curve',
    lines: ['Order 12'],
    credit: 'Paul Lévy, 1938',
    note: 'Each segment becomes two sides of a right angle',
    runs: () => [lsystem('F', { F: '+F--F+' }, 12, PI / 4).map(([u, v]): Point => [u, -v])],
    axes: false,
    weight: 0.6,
    kind: 'fractal',
  },
  {
    name: 'Ford circles',
    lines: [`A circle of radius 1/2${i('q')}${sup('2')}`, `at each fraction ${i('p')}/${i('q')}`],
    credit: 'Lester R. Ford, 1938',
    note: 'Farey neighbours give touching circles',
    runs: () => {
      const circles: Point[][] = [];
      for (let q = 1; q <= 14; q++) {
        for (let p = 0; p <= q; p++) {
          if (gcd(p, q) === 1) circles.push(ring(p / q, 1 / (2 * q * q), 1 / (2 * q * q), max(16, floor(160 / q))));
        }
      }
      return [[[-0.1, 0], [1.1, 0]], ...circles];
    },
    origin: [1, 2],
    span: 20 / 18,
    axes: false,
    weight: 0.9,
    kind: 'number',
  },
  {
    name: 'Smith chart',
    lines: [`Γ = (${z} − 1)/(${z} + 1)`],
    credit: 'Phillip H. Smith, 1939',
    note: 'Lines of constant resistance and reactance',
    runs: () => {
      const gamma = (re: number, im: number): Point => {
        const d = (re + 1) ** 2 + im * im;
        return [(re * re + im * im - 1) / d, (2 * im) / d];
      };
      const steps = [0.2, 0.5, 1, 2, 5];
      return [
        ring(0, 0, 1, 240),
        [[-1, 0], [1, 0]],
        ...steps.map((re) => sample(-PI / 2 + 1e-3, PI / 2 - 1e-3, 400, (a) => gamma(re, tan(a)))),
        ...steps.flatMap((im) => [im, -im]).map((im) => sample(0, PI / 2 - 1e-3, 300, (a) => gamma(tan(a), im))),
      ];
    },
    axes: false,
    weight: 1,
    kind: 'physics',
  },
  {
    name: 'Pythagoras tree',
    lines: ['Ten generations'],
    credit: 'Albert E. Bosman, 1942',
    note: 'On each square, a right triangle and two more squares',
    runs: () => pythagoras(9, 0.62),
    axes: false,
    weight: 0.8,
    kind: 'fractal',
  },
  {
    name: 'Lorenz attractor',
    lines: [`${x}′ = 10(${y} − ${x}),`, `${y}′ = ${x}(28 − ${z}) − ${y},`, `${z}′ = ${x}${y} − ${sup('8')}⁄${sub('3')}${z}`],
    credit: 'Edward Lorenz, 1963',
    note: 'Deterministic, and never repeats',
    runs: () => [flow(([a, b, c]) => [10 * (b - a), a * (28 - c) - b, a * b - (8 / 3) * c], [1, 1, 1], 0.005, 9000).slice(600).map(([a, , c]): Point => [a, c])],
    axes: false,
    weight: 0.5,
    kind: 'dynamics',
  },
  {
    name: 'Ulam spiral',
    lines: ['The numbers 1 to 361,', 'primes marked'],
    credit: 'Stanisław Ulam, 1963',
    note: 'Doodled in a dull meeting: the primes line up',
    runs: () => [squareSpiral(361)],
    dots: () => squareSpiral(361).filter((_, c) => isPrime(c + 1)),
    dotRadius: 3.4,
    span: 20,
    axes: false,
    weight: 0.5,
    kind: 'number',
  },
  {
    name: 'Dragon curve',
    lines: ['Eleven folds'],
    credit: 'John Heighway, 1966',
    note: 'A strip of paper folded in half, again and again',
    runs: () => [chamfer(lsystem('FX', { X: 'X+YF+', Y: '-FX-Y' }, 11, PI / 2))],
    axes: false,
    weight: 0.9,
    kind: 'fractal',
  },
  {
    name: 'Gosper curve',
    lines: ['Order 4'],
    credit: 'Bill Gosper, publ. 1976',
    note: 'The flowsnake: it fills a hexagon with a fractal edge',
    runs: () => [lsystem('A', { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' }, 4, PI / 3, 'AB')],
    axes: false,
    weight: 0.8,
    kind: 'fractal',
  },
  {
    name: 'Logistic map',
    lines: [`${x}${sub(`${n}+1`)} = 3.9${x}${sub(n)}(1 − ${x}${sub(n)})`],
    credit: 'Robert May, 1976',
    note: 'A simple rule with chaotic behaviour',
    runs: () => {
      const web: Point[] = [[0.2, 0]];
      let u = 0.2;
      for (let c = 0; c < 70; c++) {
        const next = 3.9 * u * (1 - u);
        web.push([u, next], [next, next]);
        u = next;
      }
      return [sample(0, 1, 300, (s) => [s, 3.9 * s * (1 - s)]), [[0, 0], [1, 1]], web];
    },
    origin: [1, 1],
    span: 20 / 18,
    weight: 0.7,
    kind: 'dynamics',
  },
  {
    name: 'Sunflower',
    lines: [`${r} = √${n},`, `${θ} = 137.5°${n}`],
    credit: 'Helmut Vogel, 1979',
    note: 'Every seed lies on one Fermat spiral',
    runs: () => [sample(0, 300, 6000, (m) => [sqrt(m) * cos(m * 2.39996323), sqrt(m) * sin(m * 2.39996323)])],
    dots: () => Array.from({ length: 300 }, (_, m): Point => [sqrt(m + 1) * cos((m + 1) * 2.39996323), sqrt(m + 1) * sin((m + 1) * 2.39996323)]),
    dotRadius: 2.6,
    axes: false,
    weight: 0.25,
    kind: 'number',
  },
  {
    name: 'Mandelbrot lemniscates',
    lines: [`|${z}${sub(n)}| = 2, where`, `${z}${sub(`${n}+1`)} = ${z}${sub(n)}${sup('2')} + ${i('c')}`],
    credit: 'Benoit Mandelbrot, 1980',
    note: 'Eight curves closing in on the Mandelbrot set',
    runs: () => [2, 3, 4, 5, 6, 7, 8, 9].flatMap((depth) => contour((u, v) => {
      let [a, b] = [0, 0];
      for (let m = 0; m < depth && a * a + b * b < 1e6; m++) [a, b] = [a * a - b * b + u, 2 * a * b + v];
      return log(a * a + b * b + 1e-300) - log(4);
    }, [-2.2, 1.2, -1.7, 1.7], 340)),
    origin: [12.95, 10],
    span: 3.4,
    axes: false,
    weight: 0.8,
    kind: 'fractal',
  },
  {
    name: 'Maurer rose',
    lines: [`${r} = sin 5${θ},`, `${θ} = 97${k}°`],
    credit: 'Peter M. Maurer, 1987',
    note: '360 chords of a five-petalled rose',
    runs: () => [Array.from({ length: 361 }, (_, c) => polar((a) => sin(5 * a))((97 * c * PI) / 180))],
    weight: 0.6,
    kind: 'envelope',
  },
  {
    name: 'Elliptic curve 37a',
    lines: [`${y}${sup('2')} + ${y} = ${x}${sup('3')} − ${x}`],
    credit: 'Cremona’s tables, 1992',
    note: 'The smallest conductor of any curve over ℚ of positive rank',
    runs: () => cubic((u) => u ** 3 - u + 0.25, -3.3, 4.9, -0.5),
    dots: () => [[-1, 0], [-1, -1], [0, 0], [0, -1], [1, 0], [1, -1], [2, 2], [2, -3]],
    origin: [8, 10],
    span: 8,
    weight: 1.6,
    kind: 'number',
  },
  {
    name: 'Figure-eight orbit',
    lines: ['Three equal masses,', 'one path'],
    credit: 'Cris Moore, 1993',
    note: 'A stable solution of the three-body problem',
    runs: () => [eight().filter((_, c) => c % 4 === 0).map((s): Point => [s[0], s[1]])],
    dots: () => {
      const s = eight()[260];
      return [[s[0], s[1]], [s[2], s[3]], [s[4], s[5]]];
    },
    weight: 1.4,
    kind: 'dynamics',
  },
  {
    name: 'Trott curve',
    lines: [`144(${x}${sup('4')} + ${y}${sup('4')}) − 225(${x}${sup('2')} + ${y}${sup('2')})`, `+ 350${x}${sup('2')}${y}${sup('2')} + 81 = 0`],
    credit: 'Michael Trott, 1997',
    note: 'A quartic with all 28 of its bitangents real',
    runs: () => contour((u, v) => 144 * (u ** 4 + v ** 4) - 225 * (u * u + v * v) + 350 * u * u * v * v + 81, [-1.3, 1.3, -1.3, 1.3], 320),
    weight: 1.5,
    kind: 'number',
  },
  {
    name: 'secp256k1, over ℝ',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} + 7`],
    credit: 'Certicom Research, 2000',
    note: 'Over a finite field, it signs Bitcoin transactions',
    runs: () => cubic((u) => u ** 3 + 7, -5, 7.4),
    origin: [8, 10],
    span: 12,
    weight: 1.6,
    kind: 'number',
  },
  {
    name: 'Mystery curve',
    lines: [`${z} = e${sup(`${i('i')}${t}`)} + ½e${sup(`6${i('i')}${t}`)} + ⅓${i('i')}e${sup(`−14${i('i')}${t}`)}`],
    credit: 'Frank A. Farris, 2015',
    note: 'Three wheels, turning at rates 1, 6 and −14',
    runs: () => [sample(0, TAU, 2000, (s) => [cos(s) + cos(6 * s) / 2 + sin(14 * s) / 3, sin(s) + sin(6 * s) / 2 + cos(14 * s) / 3])],
    weight: 1.2,
    kind: 'roulette',
  },
];

export const SIZE = 400;
const CELL = 20;
const MARGIN = 34;
// Runs are cut where they leave the plate, just past its edge.
const LO = -2;
const HI = SIZE + 2;

export interface Plate {
  path: string;
  dots: Point[];
  /** Plate positions of the axes, when they are drawn and on the plate. */
  xAxis: number | null;
  yAxis: number | null;
}

const finite = ([u, v]: Point) => Number.isFinite(u) && Number.isFinite(v);
const onPlate = ([u, v]: Point) => u >= LO && u <= HI && v >= LO && v <= HI;

/** Where the segment from a (on the plate) towards b leaves it. */
function edge(a: Point, b: Point): Point {
  let s = 1;
  for (const c of [0, 1]) {
    if (b[c] > HI) s = min(s, (HI - a[c]) / (b[c] - a[c]));
    if (b[c] < LO) s = min(s, (LO - a[c]) / (b[c] - a[c]));
  }
  return [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])];
}

/** Split a run into the pieces that lie on the plate, each ending on its edge. */
function clip(run: Point[]): Point[][] {
  const pieces: Point[][] = [];
  let piece: Point[] = [];
  run.forEach((p, c) => {
    const prev = run[c - 1];
    if (onPlate(p)) {
      if (!piece.length && prev && finite(prev)) piece.push(edge(p, prev));
      piece.push(p);
    } else if (piece.length) {
      if (finite(p)) piece.push(edge(piece[piece.length - 1], p));
      pieces.push(piece);
      piece = [];
    }
  });
  if (piece.length) pieces.push(piece);
  return pieces;
}

/** Scale and place a curve on the plate. */
export function frame(curve: Curve): Plate {
  const runs = curve.runs();
  const points = runs.flat().filter(finite);
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [u, v] of points) [x0, x1, y0, y1] = [min(x0, u), max(x1, u), min(y0, v), max(y1, v)];
  const axes = curve.axes !== false;
  let scale: number;
  let ox: number;
  let oy: number;
  if (!axes && !curve.span) {
    scale = (SIZE - 2 * MARGIN) / max(x1 - x0, y1 - y0);
    ox = SIZE / 2 - (scale * (x0 + x1)) / 2;
    oy = SIZE / 2 + (scale * (y0 + y1)) / 2;
  } else {
    const [cx, cy] = curve.origin ?? [10, 10];
    [ox, oy] = [cx * CELL, SIZE - cy * CELL];
    // Without a fixed span, the largest scale that keeps the curve inside the margins.
    scale = curve.span
      ? SIZE / curve.span
      : min(
          x1 > 0 ? (SIZE - MARGIN - ox) / x1 : Infinity,
          x0 < 0 ? (ox - MARGIN) / -x0 : Infinity,
          y1 > 0 ? (oy - MARGIN) / y1 : Infinity,
          y0 < 0 ? (SIZE - MARGIN - oy) / -y0 : Infinity,
        );
  }
  const place = ([u, v]: Point): Point => [ox + scale * u, oy - scale * v];
  const path = runs
    .flatMap((run) => clip(run.map(place)))
    .filter((piece) => piece.length > 1)
    .map((piece) => 'M' + piece.map(([u, v]) => `${u.toFixed(1)} ${v.toFixed(1)}`).join('L'))
    .join('');
  return {
    path,
    dots: (curve.dots?.() ?? []).map(place),
    xAxis: axes && oy > 0 && oy < SIZE ? oy : null,
    yAxis: axes && ox > 0 && ox < SIZE ? ox : null,
  };
}
