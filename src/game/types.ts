export type ZombieKind = "walker" | "runner" | "riot" | "toxic" | "titan";

export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  size: number;
  wobble: number;
  dying?: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

export interface Wall {
  y: number;          // horizontal line position
  hp: number;
  maxHp: number;
  label: string;
  broken: boolean;
}

export type Phase = 1 | 2 | 3 | 4 | 5;

export interface GameState {
  running: boolean;
  multiplier: number;
  phase: Phase;
  startedAt: number;
  shake: number;
  flash: number;
  broadcast?: { text: string; until: number };
}
