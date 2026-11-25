// The figure plate's library. Each curve is plain data: how to work out its
// runs of points in mathematical coordinates, how to frame them, and a
// caption. `frame` turns a curve into SVG path data on the 400-unit plate.
// The drawing tools are in tools.ts, and the figures that need a view of
// space, a knot diagram or the hyperbolic plane are worked out in geometry.ts.

import { type Point, sample, polar, ring, contour, flow, keep, gcd } from './tools';
import * as geometry from './geometry';

export type { Point };

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
  kind: 'classical' | 'roulette' | 'number' | 'fractal' | 'analysis' | 'dynamics' | 'physics' | 'envelope' | 'geometry' | 'surface' | 'tiling';
}

const { PI, sin, cos, tan, asin, sqrt, cbrt, exp, log, abs, floor, round, min, max, hypot, sign, cosh, tanh } = Math;
const TAU = 2 * PI;

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

/** Recamán's sequence, each step a semicircle, above and below the line by turns. */
function recaman(count = 65): Point[][] {
  const used = new Set([0]);
  let a = 0;
  const stroke: Point[] = [];
  for (let n = 1; n <= count; n++) {
    const b = a - n > 0 && !used.has(a - n) ? a - n : a + n;
    used.add(b);
    const [c, r, up, way] = [(a + b) / 2, n / 2, n % 2 ? 1 : -1, a < b ? -1 : 1];
    stroke.push(...sample(0, PI, 10 + n, (t): Point => [c + way * r * cos(t), up * r * sin(t)]));
    a = b;
  }
  return [stroke];
}

/** Hofstadter's butterfly: the allowed energies of an electron on a square lattice, for each rational flux p/q. */
function hofstadter(limit = 30): Point[][] {
  const runs: Point[][] = [];
  for (let q = 1; q <= limit; q++) {
    for (let p = 0; p <= q; p++) {
      if (gcd(p, q) !== 1) continue;
      const excess = (E: number) => {
        let [a, b, c, d] = [1, 0, 0, 1];
        for (let n = 0; n < q; n++) {
          const v = E - 2 * cos((TAU * p * n) / q + PI / (2 * q));
          [a, b, c, d] = [v * a - c, v * b - d, a, b];
        }
        return abs(a + d) - 4;
      };
      const step = 0.01;
      let [before, from] = [excess(-4.03), NaN];
      for (let E = -4.03 + step; E < 4.04; E += step) {
        const now = excess(E);
        const edge = E - step + (step * before) / (before - now);
        if (before > 0 && now <= 0) from = edge;
        if (before <= 0 && now > 0 && !Number.isNaN(from)) runs.push([[from, (8 * p) / q], [max(edge, from + 0.004), (8 * p) / q]]);
        before = now;
      }
    }
  }
  return runs;
}

/** Penrose's rhombs, by a rewriting rule: each edge once. */
function penrose(depth = 4): Point[][] {
  const rules: Record<string, string> = {
    6: '81++91----71[-81----61]++',
    7: '+81--91[---61--71]+',
    8: '-61++71[+++81++91]-',
    9: '--81++++61[+91++++71]--71',
    1: '',
  };
  let word = '[7]++[7]++[7]++[7]++[7]';
  for (let n = 0; n < depth; n++) word = [...word].map((c) => rules[c] ?? c).join('');
  let [x, y, a] = [0, 0, 0];
  const stack: number[][] = [];
  const edges = new Map<string, Point[]>();
  const mark = (u: number, v: number) => `${round(u * 1000)},${round(v * 1000)}`;
  for (const c of word) {
    if (c === '+') a += PI / 5;
    else if (c === '-') a -= PI / 5;
    else if (c === '[') stack.push([x, y, a]);
    else if (c === ']') [x, y, a] = stack.pop()!;
    else if (c === '1') {
      const [u, v] = [x + cos(a), y + sin(a)];
      const key = [mark(x, y), mark(u, v)].sort().join('|');
      if (!edges.has(key)) edges.set(key, [[x, y], [u, v]]);
      [x, y] = [u, v];
    }
  }
  return [...edges.values()];
}

/** Lines of force between charges of 20 and −5, twenty-four from the larger. */
function linesOfForce(): Point[][] {
  const charges = [[20, -1, 0], [-5, 1, 0]];
  const field = (x: number, y: number): Point => {
    let [ex, ey] = [0, 0];
    for (const [q, cx, cy] of charges) {
      const d3 = hypot(x - cx, y - cy) ** 3;
      ex += (q * (x - cx)) / d3;
      ey += (q * (y - cy)) / d3;
    }
    const m = hypot(ex, ey);
    return [ex / m, ey / m];
  };
  return Array.from({ length: 24 }, (_, k) => {
    const a = (TAU * (k + 0.5)) / 24;
    let [x, y] = [-1 + 0.05 * cos(a), 0.05 * sin(a)];
    const line: Point[] = [[x, y]];
    for (let n = 0; n < 4000; n++) {
      const [mx, my] = field(x, y);
      const [ex, ey] = field(x + 0.006 * mx, y + 0.006 * my);
      x += 0.012 * ex;
      y += 0.012 * ey;
      if (hypot(x - 1, y) < 0.04 || abs(x - 0.5) > 5 || abs(y) > 5) break;
      if (n % 3 === 2) line.push([x, y]);
    }
    return [...line, [x, y] as Point];
  });
}

/** Descartes's rays through a raindrop: refracted, reflected once and refracted again, crowding at 42°. */
function rainbow(): Point[][] {
  const index = 4 / 3;
  const runs: Point[][] = [ring(0, 0, 1, 96)];
  for (const b of [0.12, 0.26, 0.4, 0.52, 0.62, 0.7, 0.77, 0.82, 0.86, 0.9, 0.935, 0.965, 0.99]) {
    const [i, r] = [asin(b), asin(b / index)];
    const at = (a: number): Point => [cos(a), sin(a)];
    const [p1, p2, p3] = [at(PI - i), at(2 * r - i), at(4 * r - i - PI)];
    const out = PI + 2 * i - 4 * r;
    runs.push([[-3.4, b], p1, p2, p3, [p3[0] + 3.4 * cos(out), p3[1] - 3.4 * sin(out)]]);
  }
  return runs;
}

/** Streamlines of Kármán's vortex street, seen moving with the vortices. */
function vortexStreet(): Point[][] {
  const h = 0.2806;
  const drift = tanh(PI * h) / 2;
  const psi = (x: number, y: number) =>
    log((cosh(TAU * (y - h / 2)) - cos(TAU * x)) / (cosh(TAU * (y + h / 2)) + cos(TAU * x))) / (4 * PI) + drift * y;
  const runs: Point[][] = [];
  for (let level = -0.48; level < 0.49; level += 0.06) runs.push(...contour((x, y) => psi(x, y) - level, [-1.3, 1.3, -1.3, 1.3], 200));
  return runs;
}

/** Two solitons of the Korteweg–de Vries equation passing through one another, time running up the page. */
function solitons(): Point[][] {
  const u = (x: number, t: number) => (12 * (3 + 4 * cosh(2 * x - 8 * t) + cosh(4 * x - 64 * t))) / (3 * cosh(x - 28 * t) + cosh(3 * x - 36 * t)) ** 2;
  const [rows, columns, rise, height] = [28, 220, 0.45, 0.19];
  const skyline = new Float64Array(columns + 1).fill(-Infinity);
  const runs: Point[][] = [];
  for (let row = 0; row < rows; row++) {
    const t = -0.55 + (1.1 * row) / (rows - 1);
    let piece: Point[] = [];
    for (let c = 0; c <= columns; c++) {
      const x = -11 + (22 * c) / columns;
      const y = row * rise + height * u(x, t);
      // A row is hidden where an earlier one stands higher on the page.
      if (y > skyline[c]) {
        piece.push([x, y]);
        skyline[c] = y;
      } else if (piece.length) {
        if (piece.length > 1) runs.push(piece);
        piece = [];
      }
    }
    if (piece.length > 1) runs.push(piece);
  }
  return runs;
}

const i = (v: string) => `<i>${v}</i>`;
const sup = (v: string) => `<sup>${v}</sup>`;
const sub = (v: string) => `<sub>${v}</sub>`;
const [x, y, t, r, θ, z, n, k] = ['x', 'y', 't', 'r', 'θ', 'z', 'n', 'k'].map(i);

// Three equal masses under gravity: positions, then velocities.
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
// The figure-eight orbit.
const eight = () => {
  const [px, py, vx, vy] = [0.97000436, -0.24308753, -0.93240737, -0.86473146];
  return flow(pull, [px, py, -px, -py, 0, 0, -vx / 2, -vy / 2, -vx / 2, -vy / 2, vx, vy], 0.002, 3163);
};
// Šuvakov and Dmitrašinović's moth I: two bodies set off alike from ±1, the third against them from between.
const moth = () => {
  const [vx, vy, period, steps] = [0.46444, 0.39606, 14.8939, 6000];
  return flow(pull, [-1, 0, 1, 0, 0, 0, vx, vy, vx, vy, -2 * vx, -2 * vy], period / steps, steps);
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
    name: 'Loxodrome',
    lines: [`sin ${i('φ')} = tanh ${i('kλ')}`],
    credit: 'Pedro Nunes, 1537',
    note: 'A ship’s course on one compass bearing',
    runs: geometry.loxodrome,
    axes: false,
    kind: 'geometry',
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
    name: 'Descartes’s rainbow',
    lines: [`sin ${i('i')} = ${sup('4')}⁄${sub('3')} sin ${r}`],
    credit: 'René Descartes, 1637',
    note: 'Rays through a raindrop crowd together at 42°',
    runs: rainbow,
    axes: false,
    weight: 1.1,
    kind: 'physics',
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
    name: 'Ruled hyperboloid',
    lines: [`${x}${sup('2')} + ${y}${sup('2')} − ${z}${sup('2')} = 1`],
    credit: 'Christopher Wren, 1669',
    note: 'A curved surface made of two families of straight lines',
    runs: geometry.hyperboloid,
    axes: false,
    weight: 1,
    kind: 'surface',
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
    name: 'Elastica',
    lines: [`${θ}″ = −sin ${θ}`],
    credit: 'Leonhard Euler, 1744',
    note: 'The shapes a thin rod takes when it is bent',
    runs: geometry.elastica,
    axes: false,
    kind: 'geometry',
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
    name: 'Lines of curvature',
    lines: [`${x}${sup('2')}/${i('a')}${sup('2')} + ${y}${sup('2')}/${i('b')}${sup('2')} + ${z}${sup('2')}/${i('c')}${sup('2')} = 1`],
    credit: 'Gaspard Monge, 1796',
    note: 'On an ellipsoid they close round four umbilics, two seen here',
    runs: geometry.curvatureLines,
    axes: false,
    weight: 1.2,
    kind: 'surface',
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
    name: 'Dupin cyclide',
    lines: ['A torus inverted in a sphere'],
    credit: 'Charles Dupin, 1822',
    note: 'Every one of its lines of curvature is a circle',
    runs: geometry.cyclide,
    axes: false,
    weight: 1,
    kind: 'surface',
  },
  {
    name: 'Geodesic on an ellipsoid',
    lines: [`${i('a')} : ${i('b')} : ${i('c')} = 1.7 : 1.2 : 0.85`],
    credit: 'Carl Jacobi, 1838',
    note: 'One straightest path, weaving between two lines of curvature',
    runs: geometry.ellipsoidGeodesic,
    axes: false,
    weight: 0.8,
    kind: 'surface',
  },
  {
    name: 'Jacobi’s last statement',
    lines: ['Geodesics from one point', 'of an ellipsoid'],
    credit: 'Carl Jacobi, 1843',
    note: 'An envelope of four cusps, proved in 2004',
    runs: geometry.fourCusps,
    axes: false,
    weight: 0.9,
    kind: 'geometry',
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
    name: 'Figure-eight knot',
    lines: [`${r} = 2 + cos 2${t}, ${θ} = 3${t},`, `${z} = sin 4${t}`],
    credit: 'Johann Benedict Listing, 1849',
    note: 'Listing’s knot: it can be turned into its mirror image',
    runs: geometry.figureEight,
    axes: false,
    weight: 2.4,
    kind: 'geometry',
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
    name: 'Möbius strip',
    lines: [`${r} = 1 + ${i('v')} cos ½${θ},`, `${z} = ${i('v')} sin ½${θ}`],
    credit: 'Listing and Möbius, 1858',
    note: 'One side and one edge',
    runs: geometry.mobius,
    axes: false,
    weight: 1.1,
    kind: 'surface',
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
    name: 'Enneper surface',
    lines: [`${x} = ${i('u')} − ⅓${i('u')}${sup('3')} + ${i('uv')}${sup('2')},`, `${z} = ${i('u')}${sup('2')} − ${i('v')}${sup('2')}`],
    credit: 'Alfred Enneper, 1864',
    note: 'A minimal surface that passes through itself',
    runs: geometry.enneper,
    axes: false,
    weight: 1,
    kind: 'surface',
  },
  {
    name: 'Dini’s surface',
    lines: [`${z} = cos ${i('v')} + ln tan ½${i('v')} + ${i('bu')}`],
    credit: 'Ulisse Dini, 1865',
    note: 'A twisted pseudosphere, with constant negative curvature',
    runs: geometry.dini,
    axes: false,
    weight: 0.9,
    kind: 'surface',
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
    name: 'Lines of force',
    lines: ['Charges of 20 and −5'],
    credit: 'James Clerk Maxwell, 1873',
    note: 'After Fig. II of his Treatise, without the equipotentials',
    runs: linesOfForce,
    dots: () => [[-1, 0], [1, 0]],
    dotRadius: 3.5,
    origin: [8.8, 10],
    span: 8.4,
    axes: false,
    weight: 1.1,
    kind: 'physics',
  },
  {
    name: 'Modular tessellation',
    lines: [`${z} ↦ ${z} + 1,`, `${z} ↦ −1/${z}`],
    credit: 'Richard Dedekind, 1877',
    note: 'Copies of one region, moved by the modular group',
    runs: geometry.modular,
    origin: [10, 1],
    span: 2.3,
    axes: false,
    weight: 1,
    kind: 'tiling',
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
    name: 'Hyperbolic tiling',
    lines: ['{7, 3}: three heptagons', 'at every corner'],
    credit: 'After Felix Klein, 1879',
    note: 'The heptagons are all one hyperbolic size',
    runs: () => geometry.hyperbolicTiling(7, 3, 4),
    axes: false,
    weight: 1,
    kind: 'tiling',
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
    name: 'Circles of curvature',
    lines: [`Of the spiral ${r} = ${θ}`],
    credit: 'Peter Guthrie Tait, 1896',
    note: 'No two of the circles meet; the spiral itself is not drawn',
    runs: geometry.osculating,
    axes: false,
    weight: 1,
    kind: 'geometry',
  },
  {
    name: 'Umbilic points',
    lines: ['Lemon, monstar, star'],
    credit: 'Gaston Darboux, 1896',
    note: 'The three ways lines of curvature meet at an umbilic',
    runs: geometry.umbilics,
    axes: false,
    weight: 1.1,
    kind: 'geometry',
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
    name: 'Kármán vortex street',
    lines: [`${i('h')}/${i('a')} = 0.281`],
    credit: 'Theodore von Kármán, 1911',
    note: 'The wake of a cylinder, seen moving with its vortices',
    runs: vortexStreet,
    span: 2.6,
    axes: false,
    weight: 1,
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
    name: 'Flamm’s paraboloid',
    lines: [`${z}${sup('2')} = 8${i('M')}(${r} − 2${i('M')})`],
    credit: 'Ludwig Flamm, 1916',
    note: 'Space round a star, drawn as a surface',
    runs: geometry.flamm,
    axes: false,
    weight: 1,
    kind: 'surface',
  },
  {
    name: 'Light past a black hole',
    lines: [`${i('u')}″ + ${i('u')} = 3${i('Mu')}${sup('2')},`, `${i('u')} = 1/${r}`],
    credit: 'David Hilbert, 1917',
    note: 'Rays aimed inside 3√3 M are caught',
    runs: geometry.lightRays,
    span: 30,
    axes: false,
    weight: 1.1,
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
    name: 'Hopf fibration',
    lines: [`${i('S')}${sup('3')} → ${i('S')}${sup('2')},`, `(${z}, ${i('w')}) ↦ ${z}/${i('w')}`],
    credit: 'Heinz Hopf, 1931',
    note: 'Each circle is one point of the sphere; any two are linked',
    // The unit circle, then fibres over half of each of two circles of latitude.
    runs: () => geometry.hopf([[0, 1], [0.3, 14, 0.5, 0], [0.6, 18, 0.5, PI]], 1.05, 0.4),
    axes: false,
    weight: 1,
    kind: 'geometry',
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
    name: 'Kruskal diagram',
    lines: [`${i('X')}${sup('2')} − ${i('T')}${sup('2')} = (${r}/2${i('M')} − 1) e${sup(`${r}/2${i('M')}`)}`],
    credit: 'Kruskal and Szekeres, 1960',
    note: 'One chart for the whole of a black hole, inside and out',
    runs: geometry.kruskal,
    span: 4.9,
    axes: false,
    weight: 1.1,
    kind: 'physics',
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
    name: 'Two solitons',
    lines: [`${i('u')}${sub(t)} + 6${i('uu')}${sub(x)} + ${i('u')}${sub(i('xxx'))} = 0`],
    credit: 'Zabusky and Kruskal, 1965',
    note: 'The waves pass through each other and come out unchanged',
    runs: solitons,
    axes: false,
    weight: 1,
    kind: 'physics',
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
    name: 'Hofstadter’s butterfly',
    lines: [`${i('ψ')}${sub(`${n}+1`)} + ${i('ψ')}${sub(`${n}−1`)}`, `+ 2 cos(2π${i('nα')}) ${i('ψ')}${sub(n)} = ${i('Eψ')}${sub(n)}`],
    credit: 'Douglas Hofstadter, 1976',
    note: 'Allowed energies against magnetic flux',
    runs: () => hofstadter(30),
    axes: false,
    weight: 1,
    kind: 'physics',
  },
  {
    name: 'Penrose tiling',
    lines: ['Rhombs of 36° and 72°'],
    credit: 'Roger Penrose, publ. 1978',
    note: 'It covers the plane and never repeats',
    runs: () => penrose(4),
    axes: false,
    weight: 1,
    kind: 'tiling',
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
    name: 'Curve-shortening flow',
    lines: [`∂${i('γ')}/∂${t} = ${i('κ')}${n}`],
    credit: 'Matthew Grayson, 1987',
    note: 'A closed curve with no crossings rounds off to a point',
    runs: () => geometry.shortening(),
    axes: false,
    weight: 1.1,
    kind: 'geometry',
  },
  {
    name: 'Recamán’s sequence',
    lines: [`${i('a')}${sub(n)} = ${i('a')}${sub(`${n}−1`)} ± ${n}`],
    credit: 'Bernardo Recamán Santos, 1991',
    note: 'Back n if that is new and positive, otherwise forward',
    runs: () => recaman(65),
    axes: false,
    weight: 1.1,
    kind: 'number',
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
    name: 'Moth I orbit',
    lines: ['Three equal masses,', 'three paths'],
    credit: 'Šuvakov and Dmitrašinović, 2013',
    note: 'One of thirteen new orbits reported that year',
    runs: () => {
      const path = moth().filter((_, c) => c % 3 === 0);
      return [0, 1, 2].map((body) => path.map((s): Point => [s[2 * body], s[2 * body + 1]]));
    },
    axes: false,
    kind: 'dynamics',
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
