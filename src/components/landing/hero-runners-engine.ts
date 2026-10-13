/**
 * Drawing loop of the homepage hero backdrop (`hero-runners.tsx` loads this
 * module after the page is interactive, S28): neon CS soldier silhouettes running along map-like
 * routes, each leaving a short trail. CT wear a helmet and backpack and carry
 * an M4; T wear a balaclava and carry an AK.
 *
 * The loop only runs while the tab is visible and the hero is on screen, and
 * with `prefers-reduced-motion` it draws a single still frame. Routes are a
 * hand-made 0..1 layout for now; real pro routes come after S13.
 */

type Side = "ct" | "t";
type Point = readonly [number, number];

interface Runner {
  route: number;
  side: Side;
  /** Position along the ping-pong loop, 0..1. */
  t: number;
  speed: number;
  /** Gait phase in radians. */
  phase: number;
  trail: [number, number][];
}

// Same values as the --ct-blue / --t-gold / --border / --canvas / --accent tokens.
const FALLBACK = {
  ct: "#5AA9FF",
  t: "#FFC23D",
  line: "rgba(190, 160, 255, 0.12)",
  dark: "#08070D",
  accent: "#9B6BFF",
};

const ROUTES: readonly (readonly Point[])[] = [
  [[0.05, 0.25], [0.35, 0.25], [0.35, 0.55], [0.65, 0.55], [0.65, 0.2], [0.95, 0.2]],
  [[0.95, 0.8], [0.7, 0.8], [0.7, 0.55], [0.4, 0.55], [0.4, 0.85], [0.1, 0.85]],
  [[0.5, 0.05], [0.5, 0.4], [0.8, 0.4], [0.8, 0.7], [0.55, 0.7], [0.55, 0.95]],
  [[0.15, 0.5], [0.3, 0.5], [0.3, 0.12], [0.6, 0.12], [0.6, 0.35], [0.9, 0.35]],
  [[0.9, 0.6], [0.75, 0.6], [0.75, 0.92], [0.45, 0.92], [0.45, 0.7], [0.2, 0.7]],
];

/** Bomb sites drawn as faint labelled squares, like a radar. */
const SITES: readonly { label: string; at: Point }[] = [
  { label: "A", at: [0.82, 0.2] },
  { label: "B", at: [0.2, 0.82] },
];

const TRAIL_LENGTH = 18;

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

/** Starts drawing on `canvas`; returns the cleanup. */
export function startHeroRunners(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const rootStyle = getComputedStyle(document.documentElement);
  const colors = {
    ct: cssVar(rootStyle, "--ct-blue", FALLBACK.ct),
    t: cssVar(rootStyle, "--t-gold", FALLBACK.t),
    line: cssVar(rootStyle, "--border", FALLBACK.line),
    dark: cssVar(rootStyle, "--canvas", FALLBACK.dark),
    accent: cssVar(rootStyle, "--accent", FALLBACK.accent),
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = motionQuery.matches;

  let W = 0;
  let H = 0;
  let small = false;
  // Route geometry in pixels, rebuilt on resize.
  let paths: { pts: [number, number][]; segs: number[]; total: number }[] = [];

  const runners: Runner[] = Array.from({ length: 10 }, (_, i) => ({
    route: i % ROUTES.length,
    side: i < 5 ? "ct" : "t",
    t: (i * 0.137) % 1,
    speed: 0.018 + (i % 3) * 0.004,
    phase: i,
    trail: [],
  }));

  function resize() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    small = W < 640;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paths = ROUTES.map((route) => {
      const pts = route.map(([x, y]) => [x * W, y * H] as [number, number]);
      const segs: number[] = [];
      let total = 0;
      for (let k = 1; k < pts.length; k++) {
        const len = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        segs.push(len);
        total += len;
      }
      return { pts, segs, total };
    });
    for (const r of runners) r.trail = [];
  }

  /** Point on a route, walked forward then back so runners return the same way. */
  function pointAt(routeIndex: number, t: number): [number, number, number] {
    const { pts, segs, total } = paths[routeIndex];
    const forward = t < 0.5;
    const target = (forward ? t * 2 : 2 - t * 2) * total;
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const seg = segs[k - 1];
      if (acc + seg >= target) {
        const [ax, ay] = pts[k - 1];
        const [bx, by] = pts[k];
        const f = (target - acc) / (seg || 1);
        const heading = Math.sign(bx - ax) || 1;
        return [ax + (bx - ax) * f, ay + (by - ay) * f, forward ? heading : -heading];
      }
      acc += seg;
    }
    const [ex, ey] = pts[pts.length - 1];
    return [ex, ey, 1];
  }

  function drawMap() {
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = small ? 10 : 16;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.globalAlpha = 0.35;
    for (const { pts } of paths) {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    for (const { pts } of paths) {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    const size = small ? 34 : 48;
    ctx.font = `600 ${small ? 14 : 18}px ${cssVar(rootStyle, "--font-chakra-petch", "sans-serif")}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const site of SITES) {
      const x = site.at[0] * W;
      const y = site.at[1] * H;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = colors.accent;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
      ctx.setLineDash([]);
      ctx.fillStyle = colors.accent;
      ctx.fillText(site.label, x, y);
    }
    ctx.restore();
  }

  /** Side-view soldier, feet at (x, y), facing `dir` (1 right, -1 left). */
  function figure(x: number, y: number, dir: number, ph: number, col: string, s: number, side: Side) {
    if (!ctx) return;
    const c = ctx;
    const dark = colors.dark;
    const glow = small ? 10 : 16;
    const sw = Math.sin(ph) * 0.75;
    const bob = Math.abs(Math.cos(ph)) * 1.4;
    c.save();
    c.translate(x, y);
    c.scale(dir * s, s);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.shadowColor = col;
    c.shadowBlur = glow;

    function leg(a: number, back: boolean) {
      const hx = -1;
      const hy = -21 + bob;
      const kx = hx + Math.sin(a) * 10;
      const ky = hy + Math.cos(a) * 10;
      const shin = a - (a < 0 ? 1.1 : 0.35);
      const fx = kx + Math.sin(shin) * 10;
      const fy = ky + Math.cos(shin) * 10;
      c.globalAlpha = back ? 0.55 : 1;
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(kx, ky);
      c.lineTo(fx, fy);
      c.stroke();
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(fx - 2, fy - 2.5, 7, 4, 1.5); // boot
      c.fill();
      c.globalAlpha = 1;
    }

    leg(-sw, true);
    if (side === "ct") {
      // backpack
      c.fillStyle = col;
      c.globalAlpha = 0.7;
      c.beginPath();
      c.roundRect(-9, -38 + bob, 6, 13, 2);
      c.fill();
      c.globalAlpha = 1;
    }
    // torso with vest, leaning forward
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(-4, -21 + bob);
    c.lineTo(4, -21 + bob);
    c.lineTo(8, -39 + bob);
    c.lineTo(-3, -40 + bob);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = dark;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-1, -26 + bob);
    c.lineTo(5, -26 + bob);
    c.moveTo(0, -31 + bob);
    c.lineTo(6, -31 + bob);
    c.stroke(); // mag pouches
    c.shadowBlur = glow;
    leg(sw, false);

    // head
    const hx = 4;
    const hy = -45 + bob;
    c.fillStyle = col;
    c.beginPath();
    c.arc(hx, hy, 5, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    if (side === "ct") {
      c.beginPath();
      c.arc(hx - 0.5, hy - 1, 6.5, Math.PI * 1.02, Math.PI * 1.98);
      c.closePath();
      c.fill(); // helmet
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(hx - 7, hy - 0.5);
      c.lineTo(hx + 7.5, hy - 0.5);
      c.stroke(); // brim
      c.fillStyle = dark;
      c.fillRect(hx + 2, hy + 0.5, 4, 2); // goggles
    } else {
      c.fillStyle = dark;
      c.fillRect(hx + 1, hy - 1.5, 5, 2); // balaclava eye slit
    }
    c.shadowBlur = glow;

    // rifle held at the chest
    const gy = -33 + bob;
    c.fillStyle = col;
    c.beginPath();
    c.roundRect(-5, gy - 1, 6, 4, 1); // stock
    c.fill();
    c.beginPath();
    c.roundRect(0, gy - 1.5, 15, 4, 1); // receiver
    c.fill();
    c.fillRect(15, gy - 0.5, 9, 1.8); // barrel
    if (side === "t") {
      // curved AK magazine
      c.beginPath();
      c.moveTo(7, gy + 2);
      c.quadraticCurveTo(9, gy + 8, 12, gy + 9);
      c.lineTo(13, gy + 6);
      c.quadraticCurveTo(11, gy + 5, 10, gy + 2);
      c.fill();
    } else {
      c.fillRect(7, gy + 2, 3, 6); // straight M4 magazine
      c.fillRect(9, gy - 4, 4, 2.5); // optic
    }
    // arms
    c.strokeStyle = col;
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(1, -38 + bob);
    c.lineTo(2, gy + 3);
    c.moveTo(5, -38 + bob);
    c.lineTo(13, gy + 1);
    c.stroke();
    c.restore();
  }

  function draw(dt: number) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawMap();
    const s = small ? 0.75 : 1;
    const visible = small ? runners.filter((_, i) => i % 5 < 3) : runners;
    for (const r of visible) {
      r.t = (r.t + r.speed * dt) % 1;
      r.phase += dt * 9;
      const [x, y, dir] = pointAt(r.route, r.t);
      const col = r.side === "ct" ? colors.ct : colors.t;
      r.trail.push([x, y]);
      if (r.trail.length > TRAIL_LENGTH) r.trail.shift();
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let k = 1; k < r.trail.length; k++) {
        ctx.globalAlpha = (k / r.trail.length) * 0.35;
        ctx.beginPath();
        ctx.moveTo(r.trail[k - 1][0], r.trail[k - 1][1]);
        ctx.lineTo(r.trail[k][0], r.trail[k][1]);
        ctx.stroke();
      }
      ctx.restore();
      figure(x, y + 12 * s, dir, r.phase, col, s, r.side);
    }
  }

  let raf = 0;
  let last = 0;
  let onScreen = true;

  function frame(now: number) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /** Starts or stops the loop to match visibility, motion preference and scroll position. */
  function sync() {
    const shouldRun = !reduce && onScreen && !document.hidden;
    if (shouldRun && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && raf) {
      stop();
    }
  }

  /** Still frame for reduced motion: runners mid-route with a short trail. */
  function drawStill() {
    for (const r of runners) {
      r.trail = [];
      const t0 = r.t;
      for (let k = TRAIL_LENGTH; k > 0; k--) {
        const [x, y] = pointAt(r.route, (t0 - k * 0.002 + 1) % 1);
        r.trail.push([x, y]);
      }
    }
    draw(0);
  }

  resize();
  if (reduce) drawStill();

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (reduce) drawStill();
  });
  resizeObserver.observe(canvas);

  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  intersection.observe(canvas);

  const onMotionChange = () => {
    reduce = motionQuery.matches;
    if (reduce) {
      stop();
      drawStill();
    }
    sync();
  };
  motionQuery.addEventListener("change", onMotionChange);
  document.addEventListener("visibilitychange", sync);
  sync();

  return () => {
    stop();
    resizeObserver.disconnect();
    intersection.disconnect();
    motionQuery.removeEventListener("change", onMotionChange);
    document.removeEventListener("visibilitychange", sync);
  };
}
