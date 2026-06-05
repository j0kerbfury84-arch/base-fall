import { useEffect, useRef, useState, useCallback } from "react";
import type { Bullet, FloatingText, GameState, Particle, Phase, Wall, Zombie, ZombieKind } from "./types";

import bgUrl from "@/assets/battlefield.jpg";
import turretUrl from "@/assets/turret.png";
import zWalker from "@/assets/zombie-walker.png";
import zRunner from "@/assets/zombie-runner.png";
import zRiot from "@/assets/zombie-riot.png";
import zToxic from "@/assets/zombie-toxic.png";
import zTitan from "@/assets/zombie-titan.png";

const PHASES: { until: number; phase: Phase; label: string; broadcast?: string }[] = [
  { until: 5, phase: 1, label: "OUTER PERIMETER" },
  { until: 15, phase: 2, label: "FIRST BREACH", broadcast: "They breached the eastern wall!" },
  { until: 50, phase: 3, label: "BASE UNDER SIEGE", broadcast: "We're losing ground — fall back!" },
  { until: 150, phase: 4, label: "TOTAL COLLAPSE", broadcast: "Sector four is gone. Repeat: gone." },
  { until: Infinity, phase: 5, label: "LAST STAND", broadcast: "If anyone hears this... we're done..." },
];

function phaseFor(m: number): Phase {
  for (const p of PHASES) if (m < p.until) return p.phase;
  return 5;
}

function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

interface Props {
  bet: number;
  balance: number;
  onCashout: (multiplier: number) => void;
  onCrash: () => void;
  rapidFire: boolean;
}

export function ZombieRushCanvas({ bet, balance, onCashout, onCrash, rapidFire }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mult, setMult] = useState(1.0);
  const [phase, setPhase] = useState<Phase>(1);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const stateRef = useRef<{
    g: GameState;
    zombies: Zombie[];
    bullets: Bullet[];
    particles: Particle[];
    texts: FloatingText[];
    walls: Wall[];
    nextId: number;
    lastShot: number;
    lastSpawn: number;
    raf: number;
    width: number;
    height: number;
    images: Record<string, HTMLImageElement>;
    bg: HTMLImageElement;
    turret: HTMLImageElement;
    lastPhaseBroadcast: Phase;
  }>({
    g: { running: false, multiplier: 1, phase: 1, startedAt: 0, shake: 0, flash: 0 },
    zombies: [],
    bullets: [],
    particles: [],
    texts: [],
    walls: [],
    nextId: 1,
    lastShot: 0,
    lastSpawn: 0,
    raf: 0,
    width: 0,
    height: 0,
    images: {},
    bg: loadImage(bgUrl),
    turret: loadImage(turretUrl),
    lastPhaseBroadcast: 0 as Phase,
  });

  // Load images
  useEffect(() => {
    stateRef.current.images = {
      walker: loadImage(zWalker),
      runner: loadImage(zRunner),
      riot: loadImage(zRiot),
      toxic: loadImage(zToxic),
      titan: loadImage(zTitan),
    };
  }, []);

  const start = useCallback(() => {
    const s = stateRef.current;
    s.zombies = [];
    s.bullets = [];
    s.particles = [];
    s.texts = [];
    s.walls = [
      { y: 0.42, hp: 100, maxHp: 100, label: "FENCE", broken: false },
      { y: 0.55, hp: 150, maxHp: 150, label: "CONCRETE", broken: false },
      { y: 0.72, hp: 250, maxHp: 250, label: "BUNKER", broken: false },
    ];
    s.g = { running: true, multiplier: 1, phase: 1, startedAt: performance.now(), shake: 0, flash: 0 };
    s.lastPhaseBroadcast = 1;
    setMult(1);
    setPhase(1);
    setBroadcast(null);
    setRunning(true);
  }, []);

  const cashout = useCallback(() => {
    const s = stateRef.current;
    if (!s.g.running) return;
    s.g.running = false;
    setRunning(false);
    onCashout(s.g.multiplier);
  }, [onCashout]);

  const crash = useCallback(() => {
    const s = stateRef.current;
    if (!s.g.running) return;
    s.g.running = false;
    s.g.shake = 30;
    s.g.flash = 1;
    setRunning(false);
    onCrash();
  }, [onCrash]);

  // expose start through DOM event from parent buttons
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onStart = () => start();
    const onCash = () => cashout();
    wrap.addEventListener("zr-start", onStart);
    wrap.addEventListener("zr-cashout", onCash);
    return () => {
      wrap.removeEventListener("zr-start", onStart);
      wrap.removeEventListener("zr-cashout", onCash);
    };
  }, [start, cashout]);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    const resize = () => {
      const wrap = wrapRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.width = w;
      s.height = h;
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();

    const spawnZombie = () => {
      const m = s.g.multiplier;
      const p = s.g.phase;
      const kinds: ZombieKind[] = ["walker"];
      if (p >= 2) kinds.push("runner");
      if (p >= 3) kinds.push("riot", "runner");
      if (p >= 4) kinds.push("toxic", "riot");
      if (p >= 5) kinds.push("titan", "toxic");
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const baseHp: Record<ZombieKind, number> = { walker: 8, runner: 5, riot: 25, toxic: 18, titan: 120 };
      const baseSpeed: Record<ZombieKind, number> = { walker: 14, runner: 28, riot: 10, toxic: 16, titan: 8 };
      const baseSize: Record<ZombieKind, number> = { walker: 34, runner: 32, riot: 40, toxic: 38, titan: 64 };
      const hp = baseHp[kind] * (1 + m * 0.15);
      const z: Zombie = {
        id: s.nextId++,
        kind,
        x: 30 + Math.random() * (s.width - 60),
        y: -40 - Math.random() * 100,
        hp,
        maxHp: hp,
        speed: baseSpeed[kind] * (1 + m * 0.04),
        size: baseSize[kind],
        wobble: Math.random() * Math.PI * 2,
      };
      s.zombies.push(z);
    };

    const fire = () => {
      const turretX = s.width / 2;
      const turretY = s.height - 70;
      // find nearest zombie above
      let target: Zombie | null = null;
      let bestD = Infinity;
      for (const z of s.zombies) {
        if (z.dying) continue;
        const dx = z.x - turretX;
        const dy = z.y - turretY;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; target = z; }
      }
      const ang = target ? Math.atan2(target.y - turretY, target.x - turretX) : -Math.PI / 2;
      const speed = 700;
      s.bullets.push({
        id: s.nextId++,
        x: turretX,
        y: turretY - 20,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 1.5,
      });
      // muzzle flash
      for (let i = 0; i < 6; i++) {
        s.particles.push({
          x: turretX, y: turretY - 30,
          vx: (Math.random() - 0.5) * 200,
          vy: -Math.random() * 300 - 100,
          life: 0.3, max: 0.3,
          color: "#ffcc55", size: 4 + Math.random() * 3,
        });
      }
    };

    const explode = (x: number, y: number, color: string, count = 20) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 250;
        s.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.6 + Math.random() * 0.4, max: 1, color, size: 2 + Math.random() * 4,
        });
      }
    };

    const updatePhase = () => {
      const newPhase = phaseFor(s.g.multiplier);
      if (newPhase !== s.g.phase) {
        s.g.phase = newPhase;
        setPhase(newPhase);
        const conf = PHASES.find(p => p.phase === newPhase);
        if (conf?.broadcast && s.lastPhaseBroadcast !== newPhase) {
          s.lastPhaseBroadcast = newPhase;
          setBroadcast(conf.broadcast);
          s.g.shake = Math.max(s.g.shake, 14);
          setTimeout(() => setBroadcast(null), 3500);
        }
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (s.g.running) {
        // multiplier growth (exponential-ish, like crash games)
        const elapsed = (now - s.g.startedAt) / 1000;
        s.g.multiplier = Math.max(1, Math.pow(1.07, elapsed));
        setMult(s.g.multiplier);
        updatePhase();

        // spawn zombies
        const spawnRate = Math.min(8, 0.8 + s.g.multiplier * 0.05);
        if (now - s.lastSpawn > 1000 / spawnRate) {
          s.lastSpawn = now;
          spawnZombie();
          if (s.g.phase >= 3 && Math.random() < 0.3) spawnZombie();
        }

        // shoot
        const fireRate = (rapidFire ? 16 : 8) + Math.min(8, s.g.multiplier * 0.1);
        if (now - s.lastShot > 1000 / fireRate) {
          s.lastShot = now;
          fire();
        }
      }

      // update zombies
      for (const z of s.zombies) {
        if (z.dying) { z.dying -= dt; continue; }
        z.y += z.speed * dt;
        z.wobble += dt * 4;
        z.x += Math.sin(z.wobble) * 8 * dt;

        // Check wall collisions
        for (const w of s.walls) {
          if (w.broken) continue;
          const wallY = w.y * s.height;
          if (z.y >= wallY - 10 && z.y <= wallY + 20) {
            w.hp -= z.speed * 0.5 * dt * (z.kind === "titan" ? 6 : z.kind === "riot" ? 2 : 1);
            z.y = wallY - 10;
            if (w.hp <= 0) {
              w.broken = true;
              s.g.shake = Math.max(s.g.shake, 18);
              explode(s.width / 2, wallY, "#ff5522", 40);
            }
          }
        }

        // Reached turret => crash
        if (z.y > s.height - 60 && s.g.running) {
          crash();
          explode(z.x, z.y, "#ff3322", 60);
        }
      }

      // update bullets
      for (const b of s.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        // hit detection
        for (const z of s.zombies) {
          if (z.dying) continue;
          const dx = b.x - z.x, dy = b.y - z.y;
          if (dx * dx + dy * dy < (z.size * 0.4) * (z.size * 0.4)) {
            z.hp -= 4;
            b.life = 0;
            const dmg = 4;
            s.texts.push({ x: z.x, y: z.y, vy: -40, life: 0.7, text: `-${dmg}`, color: "#fff" });
            explode(b.x, b.y, "#ffaa44", 4);
            if (z.hp <= 0) {
              z.dying = 0.3;
              explode(z.x, z.y, z.kind === "toxic" ? "#88ff44" : "#cc3322", 18);
            }
            break;
          }
        }
      }

      // cleanup
      s.bullets = s.bullets.filter(b => b.life > 0 && b.x > -50 && b.x < s.width + 50 && b.y > -50);
      s.zombies = s.zombies.filter(z => !(z.dying !== undefined && z.dying <= 0));
      for (const p of s.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 200 * dt; p.life -= dt;
      }
      s.particles = s.particles.filter(p => p.life > 0);
      for (const t of s.texts) { t.y += t.vy * dt; t.life -= dt; }
      s.texts = s.texts.filter(t => t.life > 0);

      // ---- RENDER ----
      const w = s.width, h = s.height;
      ctx.save();
      // shake
      if (s.g.shake > 0) {
        const sx = (Math.random() - 0.5) * s.g.shake;
        const sy = (Math.random() - 0.5) * s.g.shake;
        ctx.translate(sx, sy);
        s.g.shake = Math.max(0, s.g.shake - dt * 30);
      }

      // background
      if (s.bg.complete) {
        ctx.drawImage(s.bg, 0, 0, w, h);
      } else {
        ctx.fillStyle = "#1a1208"; ctx.fillRect(0, 0, w, h);
      }

      // phase tint overlay
      const p = s.g.phase;
      const tints = ["", "rgba(60,30,0,0.15)", "rgba(120,20,10,0.28)", "rgba(180,30,10,0.4)", "rgba(255,40,20,0.55)"];
      ctx.fillStyle = tints[p - 1] || "";
      ctx.fillRect(0, 0, w, h);

      // walls
      for (const wall of s.walls) {
        const wy = wall.y * h;
        if (wall.broken) {
          // broken debris line
          ctx.fillStyle = "#3a2818";
          for (let i = 0; i < w; i += 30) {
            ctx.fillRect(i + Math.sin(i) * 3, wy + Math.sin(i) * 5, 18, 4);
          }
        } else {
          const isFence = wall.label === "FENCE";
          const isBunker = wall.label === "BUNKER";
          const hpPct = wall.hp / wall.maxHp;
          ctx.fillStyle = isFence ? "#6b4520" : isBunker ? "#5a5a5a" : "#787878";
          ctx.fillRect(0, wy - (isBunker ? 14 : 10), w, isBunker ? 22 : 16);
          // spikes for fence
          if (isFence) {
            ctx.fillStyle = "#3a2510";
            for (let i = 0; i < w; i += 14) {
              ctx.beginPath();
              ctx.moveTo(i, wy - 10);
              ctx.lineTo(i + 7, wy - 18);
              ctx.lineTo(i + 14, wy - 10);
              ctx.fill();
            }
          }
          // hp bar
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(8, wy + 14, w - 16, 4);
          ctx.fillStyle = hpPct > 0.5 ? "#4ade80" : hpPct > 0.25 ? "#fbbf24" : "#ef4444";
          ctx.fillRect(8, wy + 14, (w - 16) * hpPct, 4);
        }
      }

      // turret
      const tx = w / 2, ty = h - 70;
      if (s.turret.complete) {
        const ts = 90;
        ctx.drawImage(s.turret, tx - ts / 2, ty - ts / 2, ts, ts);
      }

      // bullets
      ctx.fillStyle = "#fff7c0";
      for (const b of s.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,200,80,0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
        ctx.stroke();
      }

      // zombies
      for (const z of s.zombies) {
        const img = s.images[z.kind];
        const alpha = z.dying !== undefined ? Math.max(0, z.dying / 0.3) : 1;
        ctx.globalAlpha = alpha;
        const bob = Math.sin(z.wobble * 2) * 2;
        if (img && img.complete) {
          ctx.drawImage(img, z.x - z.size / 2, z.y - z.size / 2 + bob, z.size, z.size);
        } else {
          ctx.fillStyle = "#4a7";
          ctx.beginPath(); ctx.arc(z.x, z.y + bob, z.size / 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // hp bar
        if (z.hp < z.maxHp && !z.dying) {
          const bw = z.size * 0.8;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(z.x - bw / 2, z.y - z.size / 2 - 6, bw, 3);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(z.x - bw / 2, z.y - z.size / 2 - 6, bw * (z.hp / z.maxHp), 3);
        }
      }

      // particles
      for (const part of s.particles) {
        ctx.globalAlpha = Math.max(0, part.life / part.max);
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // floating texts
      ctx.font = "bold 14px Rajdhani";
      ctx.textAlign = "center";
      for (const t of s.texts) {
        ctx.globalAlpha = Math.max(0, t.life / 0.7);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;

      // flash on crash
      if (s.g.flash > 0) {
        ctx.fillStyle = `rgba(255,40,20,${s.g.flash})`;
        ctx.fillRect(0, 0, w, h);
        s.g.flash = Math.max(0, s.g.flash - dt * 1.5);
      }

      // vignette for late phases
      if (p >= 3) {
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, `rgba(0,0,0,${0.3 + p * 0.1})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.restore();

      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(s.raf);
      window.removeEventListener("resize", resize);
    };
  }, [rapidFire, crash]);

  const phaseLabel = PHASES.find(p => p.phase === phase)?.label ?? "";
  const intensity = Math.min(1, (mult - 1) / 50);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-black select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Multiplier HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center">
        <div
          className="font-display tracking-wider"
          style={{
            fontSize: `clamp(2.5rem, ${5 + intensity * 5}vw, 6rem)`,
            color: phase >= 4 ? "var(--danger)" : phase >= 3 ? "var(--warning)" : phase >= 2 ? "var(--accent)" : "#fff",
            textShadow: `0 0 ${10 + intensity * 30}px currentColor, 0 4px 0 rgba(0,0,0,0.6)`,
            animation: phase >= 4 ? "pulse-glow 0.8s ease-in-out infinite" : phase >= 3 ? "pulse-glow 1.4s ease-in-out infinite" : undefined,
            transform: phase >= 5 ? `translateX(${(Math.random() - 0.5) * 4}px)` : undefined,
          }}
        >
          {mult.toFixed(2)}×
        </div>
        <div className="mt-1 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] backdrop-blur"
          style={{ color: phase >= 3 ? "var(--danger)" : "var(--muted-foreground)" }}>
          {phase >= 3 && <span className="mr-1 inline-block size-2 animate-pulse rounded-full" style={{ background: "var(--danger)" }} />}
          Phase {phase} · {phaseLabel}
        </div>
      </div>

      {/* Broadcast */}
      {broadcast && (
        <div className="pointer-events-none absolute left-1/2 top-28 -translate-x-1/2 animate-fade-in">
          <div className="rounded border-l-4 border-destructive bg-black/80 px-4 py-2 font-mono text-sm text-destructive shadow-lg backdrop-blur">
            📻 <span className="ml-1">{broadcast}</span>
          </div>
        </div>
      )}

      {/* Start overlay */}
      {!running && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="font-display text-4xl tracking-widest text-foreground sm:text-6xl">
              ZOMBIE <span style={{ color: "var(--primary)" }}>RUSH</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">The Base Is Falling</div>
            <button
              onClick={() => {
                if (balance < bet) return;
                start();
              }}
              disabled={balance < bet}
              className="mt-6 rounded-lg bg-primary px-8 py-3 font-display text-2xl tracking-wider text-primary-foreground shadow-[0_0_24px_var(--primary)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              DEPLOY · ${bet.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Cashout button (mobile bottom) */}
      {running && (
        <button
          onClick={cashout}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-accent bg-accent/90 px-6 py-3 font-display text-xl tracking-wider text-accent-foreground shadow-[0_0_20px_var(--accent)] backdrop-blur transition-transform active:scale-95"
        >
          EXTRACT · {(bet * mult).toFixed(2)}$
        </button>
      )}
    </div>
  );
}
