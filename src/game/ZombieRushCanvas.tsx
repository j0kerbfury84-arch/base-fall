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

function loadImage(src: string): HTMLImageElement | null {
  if (typeof window === "undefined" || typeof Image === "undefined") return null;
  const img = new Image();
  img.src = src;
  return img;
}

interface Props {
  bet: number;
  balance: number;
  onCashout: (multiplier: number) => void;
  onCrash: () => void;
  onStart: () => void;
  rapidFire: boolean;
}

export function ZombieRushCanvas({ bet, balance, onCashout, onCrash, onStart, rapidFire }: Props) {
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
    images: Record<string, HTMLImageElement | null>;
    bg: HTMLImageElement | null;
    turret: HTMLImageElement | null;
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
    bg: null,
    turret: null,
    lastPhaseBroadcast: 0 as Phase,
  });

  // Load images on client only
  useEffect(() => {
    const s = stateRef.current;
    s.bg = loadImage(bgUrl);
    s.turret = loadImage(turretUrl);
    s.images = {
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

  // (event-based start removed — start() called directly via DEPLOY button)

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
      const baseSpeed: Record<ZombieKind, number> = { walker: 55, runner: 95, riot: 40, toxic: 65, titan: 35 };
      const baseSize: Record<ZombieKind, number> = { walker: 56, runner: 52, riot: 64, toxic: 60, titan: 100 };
      const hp = baseHp[kind] * (1 + m * 0.15);
      const z: Zombie = {
        id: s.nextId++,
        kind,
        x: 30 + Math.random() * (s.width - 60),
        y: -baseSize[kind] - Math.random() * 40,
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
        const spawnRate = Math.min(12, 2.5 + s.g.multiplier * 0.15);
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
              z.dying = 0.4;
              s.g.shake = Math.max(s.g.shake, z.kind === "titan" ? 14 : 4);
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

      // background — procedural battlefield (always renders) + optional image overlay
      const groundGrad = ctx.createLinearGradient(0, 0, 0, h);
      groundGrad.addColorStop(0, "#1a0a06");
      groundGrad.addColorStop(0.4, "#2a1810");
      groundGrad.addColorStop(1, "#1a0e08");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, 0, w, h);

      // overlay the image softly if it loaded
      if (s.bg && s.bg.complete && s.bg.naturalWidth > 0) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(s.bg, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // procedural ground details (craters & rocks) — deterministic
      ctx.save();
      const tNow = now / 1000;
      for (let i = 0; i < 14; i++) {
        const cx = ((i * 137.5) % w);
        const cy = ((i * 89.3) % h);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 18 + (i % 4) * 6, 10 + (i % 3) * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // ember flickers in higher phases
      if (s.g.phase >= 2) {
        for (let i = 0; i < 20 + s.g.phase * 8; i++) {
          const ex = ((i * 73.1) % w);
          const ey = ((i * 51.7) % h);
          const flick = 0.5 + Math.sin(tNow * 4 + i) * 0.5;
          ctx.fillStyle = `rgba(255,${100 + i * 5},20,${0.15 * flick})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 6 + flick * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // phase tint overlay
      const p = s.g.phase;
      const tints = ["rgba(20,40,20,0.15)", "rgba(80,40,10,0.25)", "rgba(140,30,10,0.35)", "rgba(180,30,10,0.45)", "rgba(255,40,20,0.55)"];
      ctx.fillStyle = tints[p - 1] || "";
      ctx.fillRect(0, 0, w, h);

      // walls
      for (const wall of s.walls) {
        const wy = wall.y * h;
        const hpPct = wall.hp / wall.maxHp;
        if (wall.broken) {
          // broken debris line
          ctx.fillStyle = "#2a1810";
          for (let i = 0; i < w; i += 22) {
            const px = i + Math.sin(i * 0.3) * 4;
            const py = wy + Math.sin(i * 0.5) * 6;
            ctx.fillRect(px, py, 14, 5);
            ctx.fillStyle = "rgba(80,40,20,0.6)";
            ctx.fillRect(px + 3, py - 3, 3, 3);
            ctx.fillStyle = "#2a1810";
          }
        } else {
          const isFence = wall.label === "FENCE";
          const isBunker = wall.label === "BUNKER";
          const height = isBunker ? 22 : 16;
          // shadow
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(0, wy + height / 2, w, 8);
          // wall body with gradient
          const wg = ctx.createLinearGradient(0, wy - height / 2, 0, wy + height / 2);
          if (isFence) { wg.addColorStop(0, "#8b5a2b"); wg.addColorStop(1, "#4a2810"); }
          else if (isBunker) { wg.addColorStop(0, "#7a7a7a"); wg.addColorStop(1, "#3a3a3a"); }
          else { wg.addColorStop(0, "#9a9a9a"); wg.addColorStop(1, "#5a5a5a"); }
          ctx.fillStyle = wg;
          ctx.fillRect(0, wy - height / 2, w, height);
          // detail planks/blocks
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          const step = isFence ? 16 : 32;
          for (let i = 0; i < w; i += step) ctx.fillRect(i, wy - height / 2, 1, height);
          // spikes for fence
          if (isFence) {
            ctx.fillStyle = "#3a2510";
            for (let i = 0; i < w; i += 14) {
              ctx.beginPath();
              ctx.moveTo(i, wy - height / 2);
              ctx.lineTo(i + 7, wy - height / 2 - 8);
              ctx.lineTo(i + 14, wy - height / 2);
              ctx.fill();
            }
          }
          // damage cracks based on hp
          if (hpPct < 0.6) {
            ctx.strokeStyle = `rgba(0,0,0,${0.4 + (1 - hpPct) * 0.4})`;
            ctx.lineWidth = 1;
            for (let i = 0; i < (1 - hpPct) * 20; i++) {
              const cx = (i * 71.3) % w;
              ctx.beginPath();
              ctx.moveTo(cx, wy - height / 2);
              ctx.lineTo(cx + Math.sin(i) * 6, wy + height / 2);
              ctx.stroke();
            }
          }
          // hp bar
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(8, wy + height / 2 + 4, w - 16, 3);
          ctx.fillStyle = hpPct > 0.5 ? "#4ade80" : hpPct > 0.25 ? "#fbbf24" : "#ef4444";
          ctx.fillRect(8, wy + height / 2 + 4, (w - 16) * hpPct, 3);
        }
      }

      // turret with rotation toward nearest zombie
      const tx = w / 2, ty = h - 70;
      let nearest: Zombie | null = null; let bestD = Infinity;
      for (const z of s.zombies) {
        if (z.dying) continue;
        const dd = (z.x - tx) ** 2 + (z.y - ty) ** 2;
        if (dd < bestD) { bestD = dd; nearest = z; }
      }
      const tAng = nearest ? Math.atan2(nearest.y - ty, nearest.x - tx) + Math.PI / 2 : 0;
      // turret base shadow
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.ellipse(tx, ty + 30, 50, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(tAng);
      // recoil bob
      const recoil = Math.max(0, 8 - (now - s.lastShot) / 8);
      ctx.translate(0, recoil);
      if (s.turret && s.turret.complete && s.turret.naturalWidth > 0) {
        const ts = 100;
        ctx.drawImage(s.turret, -ts / 2, -ts / 2, ts, ts);
      } else {
        // fallback turret
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(-30, -30, 60, 60);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(-6, -50, 12, 30);
      }
      ctx.restore();

      // bullets — bright tracers
      for (const b of s.bullets) {
        const len = 18;
        const speed = Math.hypot(b.vx, b.vy);
        const ux = b.vx / speed, uy = b.vy / speed;
        const tg = ctx.createLinearGradient(b.x - ux * len, b.y - uy * len, b.x, b.y);
        tg.addColorStop(0, "rgba(255,180,40,0)");
        tg.addColorStop(1, "rgba(255,240,180,1)");
        ctx.strokeStyle = tg;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x - ux * len, b.y - uy * len);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // glow tip
        ctx.fillStyle = "#fff7c0";
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }

      // zombies — face the turret + bob + death scale
      for (const z of s.zombies) {
        const img = s.images[z.kind];
        const dying = z.dying !== undefined;
        const alpha = dying ? Math.max(0, (z.dying as number) / 0.4) : 1;
        const scale = dying ? 1 + (1 - alpha) * 0.4 : 1;
        const bob = Math.sin(z.wobble * 3) * 3;
        const sway = Math.sin(z.wobble * 2) * 0.08;
        ctx.save();
        ctx.translate(z.x, z.y + bob);
        ctx.rotate(sway);
        ctx.scale(scale, scale);
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.ellipse(0, z.size * 0.35, z.size * 0.35, z.size * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        const rimColor = z.kind === "toxic" ? "#9dff44" : z.kind === "titan" ? "#ff5522" : z.kind === "riot" ? "#ffaa55" : "#ff6644";
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.shadowColor = rimColor;
          ctx.shadowBlur = z.kind === "titan" ? 24 : 14;
          ctx.drawImage(img, -z.size / 2, -z.size / 2, z.size, z.size);
          ctx.shadowBlur = 0;
        } else {
          // fallback drawn zombie (so something always shows)
          const color = z.kind === "toxic" ? "#7dd33a" : z.kind === "titan" ? "#6b3a2a" : z.kind === "riot" ? "#456a4a" : z.kind === "runner" ? "#8a9a6a" : "#6a8a4a";
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(0, 0, z.size * 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#1a1a1a";
          ctx.beginPath(); ctx.arc(-z.size * 0.12, -z.size * 0.08, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(z.size * 0.12, -z.size * 0.08, 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#1a1a1a";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, z.size * 0.1, z.size * 0.18, 0, Math.PI); ctx.stroke();
        }
        // toxic aura
        if (z.kind === "toxic" && !dying) {
          ctx.globalAlpha = 0.3 + Math.sin(tNow * 6) * 0.15;
          ctx.fillStyle = "#7dff44";
          ctx.beginPath(); ctx.arc(0, 0, z.size * 0.55, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // hp bar
        if (z.hp < z.maxHp && !dying) {
          const bw = z.size * 0.7;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(z.x - bw / 2, z.y - z.size / 2 - 8, bw, 3);
          ctx.fillStyle = z.hp / z.maxHp > 0.5 ? "#4ade80" : z.hp / z.maxHp > 0.25 ? "#fbbf24" : "#ef4444";
          ctx.fillRect(z.x - bw / 2, z.y - z.size / 2 - 8, bw * (z.hp / z.maxHp), 3);
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
      <div className="pointer-events-none absolute inset-x-0 top-1 flex flex-col items-center sm:top-3">
        <div
          className="font-display tracking-wider"
          style={{
            fontSize: `clamp(1.5rem, ${4 + intensity * 4}cqw, 5rem)`,
            color: phase >= 4 ? "var(--danger)" : phase >= 3 ? "var(--warning)" : phase >= 2 ? "var(--accent)" : "#fff",
            textShadow: `0 0 ${8 + intensity * 24}px currentColor, 0 2px 0 rgba(0,0,0,0.6)`,
            animation: phase >= 4 ? "pulse-glow 0.8s ease-in-out infinite" : phase >= 3 ? "pulse-glow 1.4s ease-in-out infinite" : undefined,
            transform: phase >= 5 ? `translateX(${(Math.random() - 0.5) * 4}px)` : undefined,
            lineHeight: 1,
          }}
        >
          {mult.toFixed(2)}×
        </div>
        <div className="mt-0.5 rounded-full border border-border bg-card/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] backdrop-blur sm:mt-1 sm:px-3 sm:py-1 sm:text-xs"
          style={{ color: phase >= 3 ? "var(--danger)" : "var(--muted-foreground)" }}>
          {phase >= 3 && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full sm:size-2" style={{ background: "var(--danger)" }} />}
          P{phase} · {phaseLabel}
        </div>
      </div>

      {/* Broadcast */}
      {broadcast && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 animate-fade-in px-2 sm:top-28">
          <div className="rounded border-l-4 border-destructive bg-black/80 px-2 py-1 font-mono text-[10px] text-destructive shadow-lg backdrop-blur sm:px-4 sm:py-2 sm:text-sm">
            📻 <span className="ml-1">{broadcast}</span>
          </div>
        </div>
      )}

      {/* Start overlay */}
      {!running && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm">
          <div className="text-center">
            <div className="font-display tracking-widest text-foreground" style={{ fontSize: "clamp(1.25rem, 6cqw, 3.75rem)", lineHeight: 1 }}>
              ZOMBIE <span style={{ color: "var(--primary)" }}>RUSH</span>
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground sm:text-xs">The Base Is Falling</div>
            <button
              onClick={() => {
                if (balance < bet) return;
                onStart();
                start();
              }}
              disabled={balance < bet}
              className="mt-3 rounded-lg bg-primary px-4 py-2 font-display tracking-wider text-primary-foreground shadow-[0_0_24px_var(--primary)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 sm:mt-6 sm:px-8 sm:py-3"
              style={{ fontSize: "clamp(0.875rem, 3.5cqw, 1.5rem)" }}
            >
              DEPLOY · ${bet.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Cashout button */}
      {running && (
        <button
          onClick={cashout}
          className="absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-accent bg-accent/90 px-3 py-1.5 font-display tracking-wider text-accent-foreground shadow-[0_0_20px_var(--accent)] backdrop-blur transition-transform active:scale-95 sm:bottom-3 sm:px-6 sm:py-3"
          style={{ fontSize: "clamp(0.75rem, 3cqw, 1.25rem)" }}
        >
          EXTRACT · {(bet * mult).toFixed(2)}$
        </button>
      )}

    </div>
  );
}
