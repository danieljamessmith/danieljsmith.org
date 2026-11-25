// The plate's figures from geometry: surfaces drawn as they would be seen,
// a knot with its crossings, curves that flow, the hyperbolic plane and two
// charts of a black hole. Each function returns runs of points for a curve
// in the library.

import { type Point, sample, ring, flow, contour } from './tools';

type V3 = [number, number, number];
const { PI, sin, cos, tan, atan2, sqrt, exp, log, abs, min, max, hypot, cosh, tanh, round } = Math;
const TAU = 2 * PI;

const path3 = (from: number, to: number, steps: number, f: (t: number) => V3): V3[] =>
  Array.from({ length: steps + 1 }, (_, k) => f(from + ((to - from) * k) / steps));

/**
 * A view from far off: the figure is turned about its upright (z) axis and
 * seen from `tilt` above its horizon. A point becomes its place on the
 * page and its nearness to the eye.
 */
const view = (turn: number, tilt: number) => {
  const [ct, st, ce, se] = [cos(turn), sin(turn), cos(tilt), sin(tilt)];
  return ([x, y, z]: V3): V3 => {
    const [u, w] = [x * ct - y * st, x * st + y * ct];
    return [u, w * se + z * ce, z * se - w * ce];
  };
};
type View = ReturnType<typeof view>;
const flat = (points: V3[]): Point[] => points.map(([u, v]) => [u, v]);
/** Every nth point of each run, and its last: for figures worked out in finer steps than the plate can show. */
const thin = (runs: Point[][], every: number) => runs.map((run) => run.filter((_, k) => k % every === 0 || k === run.length - 1));

/** The stretches of a path where a test holds. */
function stretches<T>(points: T[], shows: (p: T, k: number) => boolean, place: (p: T) => Point): Point[][] {
  const pieces: Point[][] = [[]];
  points.forEach((p, k) => {
    if (shows(p, k)) pieces[pieces.length - 1].push(place(p));
    else if (pieces[pieces.length - 1].length) pieces.push([]);
  });
  return pieces.filter((piece) => piece.length > 1);
}

/**
 * Strands as a knot diagram: each is broken where it passes behind another.
 * Points are a place on the page and a nearness; strands are closed.
 */
function weave(strands: V3[][], gap: number): Point[][] {
  const along = strands.map((s) => {
    const d = [0];
    for (let k = 1; k < s.length; k++) d.push(d[k - 1] + hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]));
    return d;
  });
  const under: number[][] = strands.map(() => []);
  for (let a = 0; a < strands.length; a++) {
    for (let b = a; b < strands.length; b++) {
      const [A, B] = [strands[a], strands[b]];
      for (let j = 0; j < A.length - 1; j++) {
        const [x1, y1, z1] = A[j];
        const [x2, y2, z2] = A[j + 1];
        for (let k = a === b ? j + 2 : 0; k < B.length - 1; k++) {
          if (a === b && j === 0 && k === B.length - 2) continue;
          const [x3, y3, z3] = B[k];
          const [x4, y4, z4] = B[k + 1];
          if (max(x1, x2) < min(x3, x4) || max(x3, x4) < min(x1, x2) || max(y1, y2) < min(y3, y4) || max(y3, y4) < min(y1, y2)) continue;
          const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
          if (!den) continue;
          const s = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den;
          const t = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
          if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
          if (z1 + s * (z2 - z1) < z3 + t * (z4 - z3)) under[a].push(along[a][j] + s * (along[a][j + 1] - along[a][j]));
          else under[b].push(along[b][k] + t * (along[b][k + 1] - along[b][k]));
        }
      }
    }
  }
  return strands.flatMap((s, a) => {
    const d = along[a];
    const total = d[d.length - 1];
    const cuts = under[a]
      .flatMap((c): number[][] =>
        c - gap < 0 ? [[0, c + gap], [total + c - gap, total]] : c + gap > total ? [[c - gap, total], [0, c + gap - total]] : [[c - gap, c + gap]],
      )
      .sort((p, q) => p[0] - q[0]);
    const kept: number[][] = [];
    let from = 0;
    for (const [lo, hi] of cuts) {
      if (lo > from) kept.push([from, lo]);
      from = max(from, hi);
    }
    if (from < total) kept.push([from, total]);
    const at = (where: number): Point => {
      let k = 0;
      while (k < d.length - 2 && d[k + 1] < where) k++;
      const f = (where - d[k]) / (d[k + 1] - d[k] || 1);
      return [s[k][0] + f * (s[k + 1][0] - s[k][0]), s[k][1] + f * (s[k + 1][1] - s[k][1])];
    };
    return kept.map(([lo, hi]) => {
      const piece: Point[] = [at(lo)];
      for (let k = 0; k < s.length; k++) if (d[k] > lo && d[k] < hi) piece.push([s[k][0], s[k][1]]);
      piece.push(at(hi));
      return piece;
    });
  });
}

/**
 * The parameter curves of a surface, as seen. With `facing`, only the side
 * turned towards the eye is drawn (for a convex surface, what is visible).
 */
function wire(
  f: (u: number, v: number) => V3,
  us: number[],
  vs: number[],
  [u0, u1]: number[],
  [v0, v1]: number[],
  see: View,
  steps = 96,
  facing: 0 | 1 | -1 = 0,
): Point[][] {
  const shows = (u: number, v: number) => {
    if (!facing) return true;
    const e = 1e-4;
    const [a, b, c] = [f(u, v), f(u + e, v), f(u, v + e)];
    const [p, q] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
    const n: V3 = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    return facing * see(n)[2] > 0;
  };
  const curves: Point[][] = [];
  for (const u of us) {
    const vv = Array.from({ length: steps + 1 }, (_, k) => v0 + ((v1 - v0) * k) / steps);
    curves.push(...stretches(vv, (v) => shows(u, v), (v) => flat([see(f(u, v))])[0]));
  }
  for (const v of vs) {
    const uu = Array.from({ length: steps + 1 }, (_, k) => u0 + ((u1 - u0) * k) / steps);
    curves.push(...stretches(uu, (u) => shows(u, v), (u) => flat([see(f(u, v))])[0]));
  }
  return curves;
}
const span = (from: number, to: number, count: number) => Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));
const cycle = (count: number, from = 0) => Array.from({ length: count }, (_, k) => from + (TAU * k) / count);

// ---------------------------------------------------------------- Hopf

const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit = (p: V3): V3 => p.map((v) => v / hypot(...p)) as V3;

/** The circle through three points of space, evenly sampled. */
function circle3(A: V3, B: V3, C: V3, steps: number): V3[] {
  const a = A.map((v, k) => v - C[k]) as V3;
  const b = B.map((v, k) => v - C[k]) as V3;
  const n = cross(a, b);
  const [aa, bb, nn] = [a, b, n].map((v) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  const to = cross(a.map((v, k) => aa * b[k] - bb * v) as V3, n).map((v) => v / (2 * nn));
  const centre = C.map((v, k) => v + to[k]) as V3;
  const spoke = A.map((v, k) => v - centre[k]) as V3;
  const radius = hypot(...spoke);
  const [e1, e2] = [unit(spoke), cross(unit(n), unit(spoke))];
  return path3(0, TAU, steps, (t) => centre.map((v, k) => v + radius * (cos(t) * e1[k] + sin(t) * e2[k])) as V3);
}

/**
 * Fibres of the Hopf map, carried to space by stereographic projection.
 * Each row is a circle of latitude on the 2-sphere: its height (0 to 1),
 * how many fibres, what part of the circle they cover and where they start.
 * A height of 0 is the unit circle; 1 would be the axis.
 */
export function hopf(rows: number[][], tilt: number, turn = 0): Point[][] {
  const see = view(turn, tilt);
  const runs: Point[][] = [];
  for (const [lat, count, part = 1, start = 0] of rows) {
    const [c, s] = [cos((lat * PI) / 2), sin((lat * PI) / 2)];
    for (let m = 0; m < count; m++) {
      const phi = start + TAU * part * (part < 1 ? m / (count - 1 || 1) : m / count);
      const at = (psi: number): V3 => {
        const k = 1 / (1 - s * sin(psi + phi));
        return [c * cos(psi) * k, c * sin(psi) * k, s * cos(psi + phi) * k];
      };
      runs.push(flat(circle3(at(0), at(TAU / 3), at((2 * TAU) / 3), 72).map(see)));
    }
  }
  return runs;
}

// ---------------------------------------------------------------- Tait–Kneser

/** Circles of curvature of the spiral r = θ: each lies inside the next. */
export function osculating(): Point[][] {
  return Array.from({ length: 46 }, (_, k) => {
    const t = 0.25 + 0.215 * k;
    const [x, y] = [t * cos(t), t * sin(t)];
    const [dx, dy] = [cos(t) - t * sin(t), sin(t) + t * cos(t)];
    const [ddx, ddy] = [-2 * sin(t) - t * cos(t), 2 * cos(t) - t * sin(t)];
    const [speed, turn] = [dx * dx + dy * dy, dx * ddy - dy * ddx];
    return ring(x - (dy * speed) / turn, y + (dx * speed) / turn, speed ** 1.5 / turn, 40 + 4 * k);
  });
}

// ---------------------------------------------------------------- Ellipsoid

const outline = ([a, b, c]: V3, see: View): Point[] => {
  // The eye's direction in the figure's own coordinates, then the great circle of the unit sphere it sees edge-on.
  const e: V3 = [see([1, 0, 0])[2], see([0, 1, 0])[2], see([0, 0, 1])[2]];
  const w: V3 = [e[0] * a, e[1] * b, e[2] * c];
  const pick: V3 = abs(w[2]) < 0.9 * hypot(...w) ? [0, 0, 1] : [1, 0, 0];
  const e1 = unit(cross(w, pick));
  const e2 = unit(cross(w, e1));
  return sample(0, TAU, 120, (t) => {
    const s = [0, 1, 2].map((k) => e1[k] * cos(t) + e2[k] * sin(t));
    const p = see([a * s[0], b * s[1], c * s[2]]);
    return [p[0], p[1]];
  });
};
const faces = ([a, b, c]: V3, see: View) => {
  const e: V3 = [see([1, 0, 0])[2], see([0, 1, 0])[2], see([0, 0, 1])[2]];
  return ([x, y, z]: V3) => (x * e[0]) / (a * a) + (y * e[1]) / (b * b) + (z * e[2]) / (c * c) > 0;
};

/** The two families of lines of curvature of an ellipsoid, on the side towards the eye. */
export function curvatureLines(): Point[][] {
  const axes: V3 = [1.75, 1.2, 0.8];
  const [A, B, C] = axes.map((v) => v * v);
  const see = view(0, 1.02);
  const front = faces(axes, see);
  const runs: Point[][] = [outline(axes, see)];
  const n = 9;
  for (let k = 0; k < n; k++) {
    // Round the long axis: u fixed between b² and a².
    const u = B + (A - B) * sin((PI / 2) * (k / n)) ** 2;
    // Round the short axis: v fixed between c² and b².
    const v = B - (B - C) * sin((PI / 2) * (k / n)) ** 2;
    for (const side of [1, -1]) {
      const about = path3(0, TAU, 160, (t): V3 => {
        const w = C * cos(t) ** 2 + B * sin(t) ** 2;
        return [side * sqrt((A * (A - u) * (A - w)) / ((A - B) * (A - C))), sqrt((B * (u - B)) / (A - B)) * cos(t), sqrt((C * (u - C)) / (A - C)) * sin(t)];
      });
      const over = path3(0, TAU, 160, (t): V3 => {
        const w = B * cos(t) ** 2 + A * sin(t) ** 2;
        return [sqrt((A * (A - v)) / (A - C)) * cos(t), sqrt((B * (B - v)) / (B - C)) * sin(t), side * sqrt((C * (w - C) * (v - C)) / ((A - C) * (B - C)))];
      });
      for (const line of [about, over]) runs.push(...stretches(line, front, (p) => flat([see(p)])[0]));
    }
  }
  return runs;
}

/** A geodesic of the ellipsoid from a point with a velocity, as the points it passes. */
function geodesic(axes: V3, start: V3, velocity: V3, length: number, dt = 0.01): number[][] {
  const inv = axes.map((v) => 1 / (v * v));
  // Unit speed, and along the surface.
  const n = start.map((x, k) => x * inv[k]);
  const dot = velocity.reduce((sum, v, k) => sum + v * n[k], 0) / n.reduce((sum, v) => sum + v * v, 0);
  let v = velocity.map((c, k) => c - dot * n[k]);
  v = v.map((c) => c / hypot(...v));
  return flow(
    (s) => {
      const bend = (s[3] * s[3] * inv[0] + s[4] * s[4] * inv[1] + s[5] * s[5] * inv[2]) / ((s[0] * inv[0]) ** 2 + (s[1] * inv[1]) ** 2 + (s[2] * inv[2]) ** 2);
      return [s[3], s[4], s[5], -bend * s[0] * inv[0], -bend * s[1] * inv[1], -bend * s[2] * inv[2]];
    },
    [...start, ...v],
    dt,
    round(length / dt),
  );
}

/** One geodesic followed a long way round a triaxial ellipsoid. */
export function ellipsoidGeodesic(): Point[][] {
  const axes: V3 = [1.7, 1.2, 0.85];
  const see = view(0.5, 0.5);
  const front = faces(axes, see);
  const points = geodesic(axes, [0, axes[1], 0], [1, 0, 0.42], 360, 0.03) as V3[];
  return [outline(axes, see), ...stretches(points, front, (p) => flat([see(p)])[0])];
}

/** Geodesics from one end of the short axis of an ellipsoid, seen from the other, each drawn a little past where its neighbours cross it. */
export function fourCusps(): Point[][] {
  const axes: V3 = [1.25, 1, 0.7];
  const [count, past] = [60, 0.3];
  const inv = axes.map((v) => 1 / (v * v));
  const see = view(0, -PI / 2);
  const runs: Point[][] = [outline(axes, see)];
  const dt = 0.02;
  for (let k = 0; k < count; k++) {
    const a = (TAU * (k + 0.5)) / count;
    const points = geodesic(axes, [0, 0, axes[2]], [cos(a), sin(a), 0], 7, dt);
    // Jacobi's equation J″ + KJ = 0 along the geodesic: the first zero of J is where neighbouring geodesics meet it.
    let [j, dj, end] = [0, 1, points.length];
    for (let m = 0; m < points.length; m++) {
      const [x, y, z] = points[m];
      const curvature = (inv[0] * inv[1] * inv[2]) / ((x * inv[0]) ** 2 + (y * inv[1]) ** 2 + (z * inv[2]) ** 2) ** 2;
      dj -= curvature * j * dt;
      j += dj * dt;
      if (j < 0) {
        end = min(points.length, m + round(past / dt));
        break;
      }
    }
    runs.push(...stretches(points.slice(0, end) as V3[], (p) => p[2] < 0, (p) => flat([see(p)])[0]));
  }
  return runs;
}

// ---------------------------------------------------------------- Hyperbolic plane

type C = Point;
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
/** The motion of the disc that carries its centre to a. */
const shift = (a: C) => (z: C): C => cdiv([z[0] + a[0], z[1] + a[1]], [1 + a[0] * z[0] + a[1] * z[1], a[0] * z[1] - a[1] * z[0]]);
const minus = (a: C): C => [-a[0], -a[1]];
/** The hyperbolic line from p to q, as points along it. */
function line(p: C, q: C): Point[] {
  const w = shift(minus(p))(q);
  const steps = max(2, round(hypot(q[0] - p[0], q[1] - p[1]) * 40));
  return sample(0, 1, steps, (t) => shift(p)([t * w[0], t * w[1]]));
}
/** z mirrored in the hyperbolic line through p and q. */
function mirror(p: C, q: C, z: C): C {
  const w = shift(minus(p))(q);
  const [x, y] = shift(minus(p))(z);
  const m = w[0] * w[0] + w[1] * w[1];
  // w² z̄ / |w|²
  const [a, b] = [(w[0] * w[0] - w[1] * w[1]) / m, (2 * w[0] * w[1]) / m];
  return shift(p)([a * x + b * y, b * x - a * y]);
}

/** The tiling of the hyperbolic plane by regular p-gons, q at a corner, in Poincaré's disc. */
export function hyperbolicTiling(p: number, q: number, layers: number): Point[][] {
  const r = sqrt(cos(PI / p + PI / q) / cos(PI / p - PI / q));
  // A tile is its corners and then its centre.
  const first: C[] = [...cycle(p, PI / 2).map((a): C => [r * cos(a), r * sin(a)]), [0, 0]];
  const key = (z: C) => `${z[0].toFixed(4)},${z[1].toFixed(4)}`;
  const seen = new Set([key(first[p])]);
  const tiles = [first];
  let rim = [first];
  for (let layer = 0; layer < layers; layer++) {
    const next: C[][] = [];
    for (const tile of rim) {
      for (let k = 0; k < p; k++) {
        const image = tile.map((z) => mirror(tile[k], tile[(k + 1) % p], z));
        if (seen.has(key(image[p])) || hypot(...image[p]) > 0.975) continue;
        seen.add(key(image[p]));
        next.push(image);
      }
    }
    tiles.push(...next);
    rim = next;
  }
  const runs: Point[][] = [ring(0, 0, 1, 180)];
  const drawn = new Set<string>();
  for (const tile of tiles) {
    for (let k = 0; k < p; k++) {
      const [a, b] = [tile[k], tile[(k + 1) % p]];
      const mid = key([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      if (!drawn.has(mid)) runs.push(line(a, b));
      drawn.add(mid);
    }
  }
  return runs;
}

/** The upper half-plane cut into copies of the modular group's fundamental region. */
export function modular(): Point[][] {
  const arc: C[] = sample(PI / 3, (2 * PI) / 3, 16, (a) => [cos(a), sin(a)]);
  const ray: C[] = Array.from({ length: 30 }, (_, k) => [0.5, (sqrt(3) / 2) * exp(0.2 * k)]);
  const apply = ([a, b, c, d]: number[], [x, y]: C): C => cdiv([a * x + b, a * y], [c * x + d, c * y]);
  const times = (m: number[], n: number[]) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3]];
  const steps = [[1, 1, 0, 1], [1, -1, 0, 1], [0, -1, 1, 0]];
  const name = (m: number[]) => (m[2] < 0 || (m[2] === 0 && m[3] < 0) ? m.map((v) => -v) : m).join();
  const seen = new Set([name([1, 0, 0, 1])]);
  let rim = [[1, 0, 0, 1]];
  const all = [...rim];
  while (rim.length && all.length < 1200) {
    const next: number[][] = [];
    for (const m of rim) {
      for (const step of steps) {
        const g = times(m, step);
        const [x, y] = apply(g, [0, 2]);
        if (seen.has(name(g)) || y < 0.022 || abs(x) > 1.9) continue;
        seen.add(name(g));
        next.push(g);
      }
    }
    all.push(...next);
    rim = next;
  }
  const spaced = (points: Point[]) => points.filter((p, k) => k === 0 || k === points.length - 1 || hypot(p[0] - points[k - 1][0], p[1] - points[k - 1][1]) > 0.004);
  const runs: Point[][] = [[[-1.2, 0], [1.2, 0]]];
  const drawn = new Set<string>();
  for (const g of all) {
    const mid = apply(g, [0, 1]);
    const mark = `${mid[0].toFixed(5)},${mid[1].toFixed(5)}`;
    if (!drawn.has(mark)) runs.push(spaced(arc.map((z) => apply(g, z))));
    drawn.add(mark);
    runs.push(spaced(ray.map((z) => apply(g, z))));
  }
  return runs.filter((run) => run.length > 1);
}

// ---------------------------------------------------------------- Curves that flow

/** A closed curve moved by its curvature, drawn at equal intervals of time until it is nearly a point. */
export function shortening(slices = 12): Point[][] {
  let curve: Point[] = sample(0, TAU, 900, (a): Point => {
    const r = 1 + 0.45 * cos(3 * a) + 0.35 * sin(5 * a);
    return [r * cos(a), r * sin(a)];
  }).slice(1);

  const h = 0.02;
  const even = (points: Point[]): Point[] => {
    const d = [0];
    for (let k = 1; k <= points.length; k++) {
      const [a, b] = [points[k - 1], points[k % points.length]];
      d.push(d[k - 1] + hypot(b[0] - a[0], b[1] - a[1]));
    }
    const count = max(48, round(d[points.length] / h));
    const out: Point[] = [];
    let k = 0;
    for (let n = 0; n < count; n++) {
      const where = (d[points.length] * n) / count;
      while (d[k + 1] < where) k++;
      const f = (where - d[k]) / (d[k + 1] - d[k] || 1);
      const [a, b] = [points[k], points[(k + 1) % points.length]];
      out.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
    }
    return out;
  };
  const area = (points: Point[]) => abs(points.reduce((sum, p, k) => sum + p[0] * points[(k + 1) % points.length][1] - points[(k + 1) % points.length][0] * p[1], 0)) / 2;
  curve = even(curve);
  const whole = area(curve);
  const runs: Point[][] = [];
  let taken = 0;
  for (let step = 0; step < 60000 && taken < slices; step++) {
    if (area(curve) <= whole * (1 - taken / slices)) {
      runs.push([...curve.filter((_, k) => k % 3 === 0), curve[0]]);
      taken++;
    }
    const n = curve.length;
    // With points evenly spaced, the second difference is the curvature vector times the spacing squared.
    const rate = 0.25;
    curve = curve.map((p, k): Point => {
      const [a, b] = [curve[(k + n - 1) % n], curve[(k + 1) % n]];
      return [p[0] + rate * (a[0] - 2 * p[0] + b[0]), p[1] + rate * (a[1] - 2 * p[1] + b[1])];
    });
    if (step % 8 === 7) curve = even(curve);
  }
  return runs;
}

/** Euler's elastic curves: the shapes of a bent rod, from a gentle wave to a row of loops. */
export function elastica(): Point[][] {
  const rows: number[][] = [[0.38, 2], [0.7071, 3.5], [0.855, 6.5], [0.9089, 1], [0.955, 5.5], [1.18, 8.5]];
  const runs: Point[][] = [];
  let top = 0;
  for (const [k, periods] of rows) {
    // θ″ = −sin θ: a pendulum. Its period fixes how much of the curve to draw.
    const f = ([, , a, da]: number[]) => [cos(a), sin(a), da, -sin(a)];
    const dt = 0.01;
    const probe = flow(f, [0, 0, 0, 2 * k], dt, 4000);
    let period = 4000;
    if (k < 1) {
      let crossings = 0;
      for (let n = 1; n < probe.length; n++) if (probe[n - 1][2] * probe[n][2] < 0 && ++crossings === 2) { period = n; break; }
    } else {
      period = probe.findIndex((s) => s[2] >= TAU);
    }
    const steps = round((period * periods) / 2);
    const there = flow(f, [0, 0, 0, 2 * k], dt, steps);
    const back = flow(f, [0, 0, 0, 2 * k], -dt, steps).reverse();
    const points = [...back, ...there.slice(1)].map(([x, y]): Point => [x, y]);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const [cx, y1, y0] = [(min(...xs) + max(...xs)) / 2, max(...ys), min(...ys)];
    runs.push(points.map(([x, y]): Point => [x - cx, y - y1 + top]));
    top -= y1 - y0 + 0.5;
  }
  return thin(runs, 4);
}

// ---------------------------------------------------------------- Surfaces

export function mobius(): Point[][] {
  const see = view(0.5, 1.02);
  const f = (u: number, v: number): V3 => [(1 + v * cos(u / 2)) * cos(u), (1 + v * cos(u / 2)) * sin(u), v * sin(u / 2)];
  const edge = path3(0, 2 * TAU, 240, (u) => see(f(u, 0.42)));
  const rulings = cycle(44).map((u) => [see(f(u, -0.42)), see(f(u, 0.42))]);
  return [flat(edge), ...rulings.map(flat)];
}

export function dini(): Point[][] {
  const see = view(0.4, 0.28);
  const f = (u: number, v: number): V3 => [cos(u) * sin(v), sin(u) * sin(v), cos(v) + log(tan(v / 2)) + 0.18 * u];
  return wire(f, span(0, 2 * TAU, 49), [0.12, 0.2, 0.32, 0.48, 0.68, 0.92, 1.2, 1.5, 1.85], [0, 2 * TAU], [0.12, 1.85], see, 90);
}

export function enneper(): Point[][] {
  const see = view(0.55, 0.5);
  const f = (r: number, a: number): V3 => {
    const [u, v] = [r * cos(a), r * sin(a)];
    return [u - u ** 3 / 3 + u * v * v, v - v ** 3 / 3 + v * u * u, u * u - v * v];
  };
  return wire(f, span(0.3, 2.1, 7), cycle(32), [0, 2.1], [0, TAU], see, 120);
}

export function hyperboloid(): Point[][] {
  const see = view(0, 0.3);
  const h = 1.7;
  const lines = cycle(30).flatMap((a) => [1, -1].map((way) => [see([cos(a) + h * sin(a), sin(a) - h * cos(a), -way * h]), see([cos(a) - h * sin(a), sin(a) + h * cos(a), way * h])]));
  const rims = [h, -h].map((z) => path3(0, TAU, 96, (a) => see([sqrt(1 + h * h) * cos(a), sqrt(1 + h * h) * sin(a), z])));
  return [...rims, ...lines].map(flat);
}

export function cyclide(): Point[][] {
  const see = view(0.35, 0.72);
  const [a, c, d] = [1, 0.45, 0.68];
  const b = sqrt(a * a - c * c);
  const f = (u: number, v: number): V3 => {
    const den = a - c * cos(u) * cos(v);
    return [(d * (c - a * cos(u) * cos(v)) + b * b * cos(u)) / den, (b * sin(u) * (a - d * cos(v))) / den, (b * sin(v) * (c * cos(u) - d)) / den];
  };
  // Its outline: where the surface turns edge-on to the eye.
  const lean = (u: number, v: number) => {
    const e = 1e-4;
    const [p, q, r] = [f(u, v), f(u + e, v), f(u, v + e)];
    return see(cross(q.map((x, k) => x - p[k]) as V3, r.map((x, k) => x - p[k]) as V3))[2];
  };
  const rim = contour(lean, [0, TAU, 0, TAU], 160).map((run) => run.map(([u, v]): Point => flat([see(f(u, v))])[0]));
  return [...rim, ...wire(f, cycle(36), cycle(18), [0, TAU], [0, TAU], see, 120, 1)];
}

export function flamm(): Point[][] {
  const see = view(0, 0.42);
  const f = (r: number, a: number): V3 => [r * cos(a), r * sin(a), 2 * sqrt(r - 1)];
  return wire(f, [1, 1.12, 1.35, 1.7, 2.2, 2.85, 3.65, 4.6], cycle(28), [1, 4.6], [0, TAU], see, 96);
}

export function loxodrome(): Point[][] {
  const see = view(0, 0.5);
  const k = 0.1;
  const points = path3(-38, 38, 1500, (t): V3 => [cos(t) / cosh(k * t), sin(t) / cosh(k * t), tanh(k * t)]);
  const front = faces([1, 1, 1], see);
  return [ring(0, 0, 1, 144), ...stretches(points, (p) => front(p), (p) => flat([see(p)])[0])];
}

// ---------------------------------------------------------------- Knots

export function figureEight(): Point[][] {
  const strand = path3(0, TAU, 480, (t): V3 => [(2 + cos(2 * t)) * cos(3 * t), (2 + cos(2 * t)) * sin(3 * t), sin(4 * t)]);
  return weave([strand], 0.2);
}

// ---------------------------------------------------------------- Umbilics

/** The lines of curvature about the three kinds of umbilic: lemon, monstar and star. */
export function umbilics(): Point[][] {
  const R = 1;
  const runs: Point[][] = [];
  const kinds: [number, Point, Point[]][] = [
    // Lemon: lines cross the negative x-axis and close round the point like parabolas.
    [1, [-1.15, 1.1], [...span(0.12, 0.96, 8).map((r): Point => [-r, 0]), [0.5, 0]]],
    // Monstar: as the lemon, but with a fan of lines out of the point between ±30°.
    [3, [1.15, 1.1], [...span(0.12, 0.96, 8).map((r): Point => [-r, 0]), ...[0, 9, -9, 18, -18, 30, -30].map((a): Point => [0.5 * cos((a * PI) / 180), 0.5 * sin((a * PI) / 180)])]],
    // Star: three lines into the point, and lines turning aside between them.
    [-1, [0, -1.02], [0, 1, 2].flatMap((n) => [...span(0.14, 0.94, 6).map((r): Point => [r * cos(PI / 3 + (n * TAU) / 3), r * sin(PI / 3 + (n * TAU) / 3)]), [0.5 * cos((n * TAU) / 3), 0.5 * sin((n * TAU) / 3)] as Point])],
  ];
  for (const [k, [cx, cy], seeds] of kinds) {
    runs.push(ring(cx, cy, R, 120));
    const along = (x: number, y: number, [px, py]: Point): Point => {
      const a = atan2(k * y, x) / 2;
      const way = cos(a) * px + sin(a) * py < 0 ? -1 : 1;
      return [way * cos(a), way * sin(a)];
    };
    for (const seed of seeds) {
      const first = along(seed[0], seed[1], [1, 0.001]);
      const sides = [first, [-first[0], -first[1]] as Point].map((heading) => {
        const points: Point[] = [];
        let [x, y] = seed;
        let dir = heading;
        for (let n = 0; n < 1500; n++) {
          const mid = along(x + 0.002 * dir[0], y + 0.002 * dir[1], dir);
          x += 0.004 * mid[0];
          y += 0.004 * mid[1];
          dir = mid;
          if (hypot(x, y) > R || hypot(x, y) < 0.012) break;
          points.push([cx + x, cy + y]);
        }
        return points;
      });
      runs.push(...thin([[...sides[1].reverse(), [cx + seed[0], cy + seed[1]], ...sides[0]]], 4));
    }
  }
  return runs;
}

// ---------------------------------------------------------------- Relativity

/** Light rays past a black hole, in units of its mass: those aimed inside 3√3 are caught. */
export function lightRays(): Point[][] {
  const runs: Point[][] = [ring(0, 0, 2, 72)];
  for (const b of [2, 3, 4, 4.7, 5.05, 5.19, 5.21, 5.35, 5.7, 6.2, 7, 8, 9.2, 10.5, 12]) {
    const [far, phi0] = [34, Math.asin(b / 34)];
    const u0 = 1 / far;
    const points = flow(([u, du]) => [du, 3 * u * u - u], [u0, sqrt(1 / (b * b) - u0 * u0 + 2 * u0 ** 3)], 0.004, 4000);
    const end = points.findIndex(([u], n) => n > 0 && (u > 0.5 || u < u0 * 0.97));
    const ray = points.slice(0, end < 0 ? points.length : end).map(([u], n): Point => [-cos(phi0 + 0.004 * n) / u, sin(phi0 + 0.004 * n) / u]);
    runs.push(...thin([ray, ray.map(([x, y]): Point => [x, -y])], 5));
  }
  return runs;
}

/** Kruskal's chart of the Schwarzschild solution: lines of constant r and t, the horizons, and the jagged singularities. */
export function kruskal(): Point[][] {
  const L = 2.3;
  const runs: Point[][] = [[[-L, -L], [L, L]], [[-L, L], [L, -L]]];
  // Constant r, in units of the horizon's radius: X² − T² = (r − 1)eʳ.
  for (const r of [0.5, 0.8, 1.15, 1.3, 1.45, 1.6, 1.75]) {
    const m = (r - 1) * exp(r);
    const branch = sample(-L, L, 80, (s): Point => [s, sqrt(abs(m) + s * s)]);
    for (const way of [1, -1]) runs.push(branch.map(([s, v]): Point => (m > 0 ? [way * v, s] : [s, way * v])));
  }
  // Constant t: straight lines through the centre, as far as the singularity.
  for (const t of [0.35, 0.7]) {
    const reach = 1 / sqrt(1 - t * t);
    for (const slope of [t, -t]) {
      runs.push([[-L, -slope * L], [L, slope * L]]);
      runs.push([[-slope * min(L, reach), -min(L, reach)], [slope * min(L, reach), min(L, reach)]]);
    }
  }
  runs.push([[-L, 0], [L, 0]], [[0, -1], [0, 1]]);
  // The singularity r = 0, T² − X² = 1, drawn jagged as the convention is.
  const teeth = 46;
  for (const way of [1, -1]) {
    runs.push(sample(-L, L, teeth, (s): Point => [s, 0]).map(([s], n): Point => [s, way * (sqrt(1 + s * s) + (n % 2 ? 0.05 : -0.05))]));
  }
  return runs;
}
