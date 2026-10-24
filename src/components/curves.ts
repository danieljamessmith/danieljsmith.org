// The figure plate's library. Each curve is plain data: runs of points in
// mathematical coordinates, how to frame them, and a caption. `frame` turns
// a curve into SVG path data on the 400-unit plate.

export type Point = [number, number];

export interface Curve {
  name: string;
  /** Equation lines as fixed markup (italics, superscripts), never user input. */
  lines: string[];
  /** One short line of context under the equation. */
  note?: string;
  /** Unbroken runs of the curve, in mathematical coordinates. */
  runs: Point[][];
  /** Points to mark on the curve, such as rational points. */
  dots?: Point[];
  /** Grid cell of the origin, counted from the left and from the bottom (0 to 20). Default: the centre. */
  origin?: Point;
  /** Width of the plate in mathematical units. Default: as large as fits. */
  span?: number;
  /** Axes through the origin. Figures without them (fractals) are centred instead. */
  axes?: boolean;
  /** Stroke width in plate units. */
  weight?: number;
}

const { PI, sin, cos, sqrt, cbrt, exp, cosh, floor, min, max } = Math;
const TAU = 2 * PI;

function sample(from: number, to: number, steps: number, f: (t: number) => Point): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => f(from + ((to - from) * i) / steps));
}
const polar = (radius: (angle: number) => number) => (angle: number): Point => [
  radius(angle) * cos(angle),
  radius(angle) * sin(angle),
];

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

const i = (v: string) => `<i>${v}</i>`;
const sup = (v: string) => `<sup>${v}</sup>`;
const [x, y, t, r, θ] = ['x', 'y', 't', 'r', 'θ'].map(i);

export const curves: Curve[] = [
  {
    name: 'Butterfly curve',
    lines: [`${r} = e${sup(`sin ${θ}`)} − 2 cos 4${θ}`, `+ sin${sup('5')}((2${θ} − π)/24)`],
    note: 'Temple H. Fay, 1989',
    runs: [sample(0, 12 * PI, 3600, polar((a) => exp(sin(a)) - 2 * cos(4 * a) + sin((2 * a - PI) / 24) ** 5))],
    origin: [10, 9],
    weight: 0.9,
  },
  {
    name: 'Lissajous figure',
    lines: [`${x} = sin 3${t},`, `${y} = sin 4${t}`],
    runs: [sample(0, TAU, 720, (s) => [sin(3 * s), sin(4 * s)])],
    weight: 1.6,
  },
  {
    name: 'Elliptic curve',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} − ${x}`],
    note: 'Fermat: no rational right triangle has area 1',
    runs: cubic((u) => u ** 3 - u, -2.1, 2.1),
    span: 4,
    weight: 1.6,
  },
  {
    name: 'Hypotrochoid',
    lines: [`${x} = 2 cos ${t} + 5 cos ⅔${t},`, `${y} = 2 sin ${t} − 5 sin ⅔${t}`],
    runs: [sample(0, 3 * TAU, 1080, (s) => [2 * cos(s) + 5 * cos((2 * s) / 3), 2 * sin(s) - 5 * sin((2 * s) / 3)])],
    weight: 1.4,
  },
  {
    name: 'Taxicab curve',
    lines: [`${x}${sup('3')} + ${y}${sup('3')} = 1729`],
    note: '1729 = 1³ + 12³ = 9³ + 10³',
    runs: [sample(-2.6, 13.8, 800, (u) => [u, cbrt(1729 - u ** 3)])],
    dots: [[1, 12], [9, 10], [10, 9], [12, 1]],
    origin: [3, 3],
    span: 16,
    weight: 1.6,
  },
  {
    name: 'Rose',
    lines: [`${r} = sin 4${θ}`],
    runs: [sample(0, TAU, 720, polar((a) => sin(4 * a)))],
    weight: 1.6,
  },
  {
    name: 'Koch snowflake',
    lines: ['Fourth iteration'],
    note: 'In the limit: infinite perimeter, finite area',
    runs: [koch(4)],
    axes: false,
    weight: 1.1,
  },
  {
    name: 'Cardioid',
    lines: [`${r} = 1 + cos ${θ}`],
    runs: [sample(0, TAU, 720, polar((a) => 1 + cos(a)))],
    origin: [7, 10],
    weight: 1.6,
  },
  {
    name: 'secp256k1, over ℝ',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} + 7`],
    note: 'Over a finite field, it signs Bitcoin transactions',
    runs: cubic((u) => u ** 3 + 7, -5, 7.4),
    origin: [8, 10],
    span: 12,
    weight: 1.6,
  },
  {
    name: 'Maurer rose',
    lines: [`${r} = sin 5${θ},`, `${θ} = 97${i('k')}°`],
    runs: [Array.from({ length: 361 }, (_, k) => polar((a) => sin(5 * a))((97 * k * PI) / 180))],
    weight: 0.6,
  },
  {
    name: 'Cycloid',
    lines: [`${x} = ${t} − sin ${t},`, `${y} = cos ${t} − 1`],
    note: 'The brachistochrone: the curve of fastest descent',
    runs: [sample(0, TAU, 720, (s) => [s - sin(s), cos(s) - 1])],
    origin: [2, 13],
    span: 8,
    weight: 1.6,
  },
  {
    name: 'Lemniscate of Bernoulli',
    lines: [`(${x}${sup('2')} + ${y}${sup('2')})${sup('2')} = ${x}${sup('2')} − ${y}${sup('2')}`],
    runs: [sample(0, TAU, 720, (s) => [cos(s) / (1 + sin(s) ** 2), (sin(s) * cos(s)) / (1 + sin(s) ** 2)])],
    weight: 1.6,
  },
  {
    name: 'Mordell curve',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} − 2`],
    note: 'Its only integer points are (3, ±5)',
    runs: cubic((u) => u ** 3 - 2, -4, 8.6),
    dots: [[3, 5], [3, -5]],
    origin: [6, 10],
    span: 12,
    weight: 1.6,
  },
  {
    name: 'Epicycloid',
    lines: [`${x} = 6 cos ${t} − cos 6${t},`, `${y} = 6 sin ${t} − sin 6${t}`],
    runs: [sample(0, TAU, 720, (s) => [6 * cos(s) - cos(6 * s), 6 * sin(s) - sin(6 * s)])],
    weight: 1.6,
  },
  {
    name: 'Fermat’s spiral',
    lines: [`${r}${sup('2')} = ${θ}`],
    runs: [[
      ...sample(0, 6 * PI, 900, (a) => [-sqrt(a) * cos(a), -sqrt(a) * sin(a)]).reverse(),
      ...sample(0, 6 * PI, 900, (a) => [sqrt(a) * cos(a), sqrt(a) * sin(a)]),
    ]],
    weight: 1.2,
  },
  {
    name: 'Astroid',
    lines: [`${x}${sup('2/3')} + ${y}${sup('2/3')} = 1`],
    runs: [sample(0, TAU, 720, (s) => [cos(s) ** 3, sin(s) ** 3])],
    weight: 1.6,
  },
  {
    name: 'Elliptic curve 37a',
    lines: [`${y}${sup('2')} + ${y} = ${x}${sup('3')} − ${x}`],
    note: 'The smallest conductor of any curve of positive rank',
    runs: cubic((u) => u ** 3 - u + 0.25, -3.3, 4.9, -0.5),
    dots: [[-1, 0], [-1, -1], [0, 0], [0, -1], [1, 0], [1, -1], [2, 2], [2, -3]],
    origin: [8, 10],
    span: 8,
    weight: 1.6,
  },
  {
    name: 'Trefoil',
    lines: [`${x} = sin ${t} + 2 sin 2${t},`, `${y} = cos ${t} − 2 cos 2${t}`],
    runs: [sample(0, TAU, 720, (s) => [sin(s) + 2 * sin(2 * s), cos(s) - 2 * cos(2 * s)])],
    weight: 1.6,
  },
  {
    name: 'Catenary',
    lines: [`${y} = cosh ${x}`],
    note: 'The shape of a hanging chain',
    runs: [sample(-3.1, 3.1, 600, (u) => [u, cosh(u)])],
    origin: [10, 4],
    span: 6,
    weight: 1.6,
  },
  {
    name: 'Rose',
    lines: [`${r} = cos(7${θ}/4)`],
    runs: [sample(0, 8 * PI, 1440, polar((a) => cos((7 * a) / 4)))],
    weight: 1.2,
  },
  {
    name: 'Congruent number curve',
    lines: [`${y}${sup('2')} = ${x}${sup('3')} − 25${x}`],
    note: '(−4, 6) gives a rational right triangle of area 5',
    runs: cubic((u) => u ** 3 - 25 * u, -10.5, 10.5),
    dots: [[-4, 6], [-4, -6]],
    span: 20,
    weight: 1.6,
  },
  {
    name: 'Deltoid',
    lines: [`${x} = 2 cos ${t} + cos 2${t},`, `${y} = 2 sin ${t} − sin 2${t}`],
    runs: [sample(0, TAU, 720, (s) => [2 * cos(s) + cos(2 * s), 2 * sin(s) - sin(2 * s)])],
    weight: 1.6,
  },
  {
    name: 'Folium of Descartes',
    lines: [`${x}${sup('3')} + ${y}${sup('3')} = 3${x}${y}`],
    runs: [sample(-PI / 4 + 0.01, (3 * PI) / 4 - 0.01, 1600, polar((a) => (3 * sin(a) * cos(a)) / (sin(a) ** 3 + cos(a) ** 3)))],
    origin: [9, 9],
    span: 6,
    weight: 1.6,
  },
  {
    name: 'Hilbert curve',
    lines: ['Order 4'],
    note: 'In the limit, it fills the square',
    runs: [hilbert(4)],
    axes: false,
    weight: 1.3,
  },
  {
    name: 'Limaçon',
    lines: [`${r} = 1 + 2 cos ${θ}`],
    runs: [sample(0, TAU, 720, polar((a) => 1 + 2 * cos(a)))],
    origin: [6, 10],
    weight: 1.6,
  },
  {
    name: 'Archimedean spiral',
    lines: [`${r} = ${θ}`],
    runs: [sample(0, 6 * PI, 1080, polar((a) => a))],
    weight: 1.4,
  },
  {
    name: 'Lissajous figure',
    lines: [`${x} = sin 5${t},`, `${y} = sin 6${t}`],
    runs: [sample(0, TAU, 1080, (s) => [sin(5 * s), sin(6 * s)])],
    weight: 1.2,
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
  for (const k of [0, 1]) {
    if (b[k] > HI) s = min(s, (HI - a[k]) / (b[k] - a[k]));
    if (b[k] < LO) s = min(s, (LO - a[k]) / (b[k] - a[k]));
  }
  return [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])];
}

/** Split a run into the pieces that lie on the plate, each ending on its edge. */
function clip(run: Point[]): Point[][] {
  const pieces: Point[][] = [];
  let piece: Point[] = [];
  run.forEach((p, k) => {
    const prev = run[k - 1];
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
  const points = curve.runs.flat().filter(finite);
  const [x0, x1] = [min(...points.map(([u]) => u)), max(...points.map(([u]) => u))];
  const [y0, y1] = [min(...points.map(([, v]) => v)), max(...points.map(([, v]) => v))];
  let scale: number;
  let ox: number;
  let oy: number;
  if (curve.axes === false) {
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
  const path = curve.runs
    .flatMap((run) => clip(run.map(place)))
    .filter((piece) => piece.length > 1)
    .map((piece) => 'M' + piece.map(([u, v]) => `${u.toFixed(1)} ${v.toFixed(1)}`).join('L'))
    .join('');
  const axes = curve.axes !== false;
  return {
    path,
    dots: (curve.dots ?? []).map(place),
    xAxis: axes && oy > 0 && oy < SIZE ? oy : null,
    yAxis: axes && ox > 0 && ox < SIZE ? ox : null,
  };
}
