import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ZombieRushCanvas } from "@/game/ZombieRushCanvas";
import { Minus, Plus, Volume2, VolumeX, Zap, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zombie Rush 2 — The Base Is Falling" },
      { name: "description", content: "Survive the zombie siege. Cash out before the base falls — a cinematic crash-style defense game." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { property: "og:title", content: "Zombie Rush 2 — The Base Is Falling" },
      { property: "og:description", content: "Survive the zombie siege. Cash out before the base falls." },
    ],
  }),
  component: Index,
});

type Layout = "wide" | "tall" | "tiny";

function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("tall");
  useEffect(() => {
    const tiny = window.matchMedia("(max-height: 360px) and (max-width: 900px)");
    const wide = window.matchMedia("(min-width: 700px) and (orientation: landscape)");
    const calc = () => {
      if (tiny.matches) setLayout("tiny");
      else if (wide.matches) setLayout("wide");
      else setLayout("tall");
    };
    calc();
    tiny.addEventListener("change", calc);
    wide.addEventListener("change", calc);
    return () => {
      tiny.removeEventListener("change", calc);
      wide.removeEventListener("change", calc);
    };
  }, []);
  return layout;
}

function Index() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(1);
  const [rapidFire, setRapidFire] = useState(false);
  const [sound, setSound] = useState(true);
  const [lastResult, setLastResult] = useState<{ type: "win" | "loss"; amount: number; mult?: number } | null>(null);
  const [history, setHistory] = useState<{ mult: number; cashed: boolean }[]>([]);
  const [betLocked, setBetLocked] = useState(false);
  const layout = useLayout();

  const handleStart = () => {
    setBalance(b => b - bet);
    setBetLocked(true);
  };
  const handleCashout = (mult: number) => {
    const win = bet * mult;
    setBalance(b => b + win);
    setLastResult({ type: "win", amount: win, mult });
    setHistory(h => [{ mult, cashed: true }, ...h].slice(0, 6));
    setBetLocked(false);
  };
  const handleCrash = () => {
    setLastResult({ type: "loss", amount: bet });
    setHistory(h => [{ mult: 0, cashed: false }, ...h].slice(0, 6));
    setBetLocked(false);
  };
  const adjustBet = (delta: number) => {
    if (betLocked) return;
    setBet(b => Math.max(0.1, Math.min(balance, Math.round((b + delta) * 100) / 100)));
  };
  useEffect(() => {
    if (lastResult) {
      const t = setTimeout(() => setLastResult(null), 2500);
      return () => clearTimeout(t);
    }
  }, [lastResult]);

  const Game = (
    <ZombieRushCanvas
      bet={bet}
      balance={balance}
      onStart={handleStart}
      onCashout={handleCashout}
      onCrash={handleCrash}
      rapidFire={rapidFire}
    />
  );

  // ───── TINY (popout S, very small) ─────
  if (layout === "tiny") {
    return (
      <div className="fixed inset-0 flex overflow-hidden bg-background text-foreground">
        <div className="relative flex-1">
          {Game}
          {/* tiny overlay HUD */}
          <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur">
            ${balance.toFixed(0)}
          </div>
        </div>
        <div className="flex w-[88px] flex-col gap-1 border-l border-border bg-card p-1">
          <div className="rounded bg-background/60 px-1 py-0.5 text-center">
            <div className="text-[7px] uppercase text-muted-foreground">Bet</div>
            <div className="font-display text-xs leading-none">${bet.toFixed(2)}</div>
          </div>
          <div className="flex gap-0.5">
            <button onClick={() => adjustBet(-1)} disabled={betLocked}
              className="grid h-5 flex-1 place-items-center rounded bg-secondary text-foreground disabled:opacity-40">
              <Minus className="size-2.5" />
            </button>
            <button onClick={() => adjustBet(1)} disabled={betLocked}
              className="grid h-5 flex-1 place-items-center rounded bg-primary text-primary-foreground disabled:opacity-40">
              <Plus className="size-2.5" />
            </button>
          </div>
          <button
            onClick={() => setRapidFire(r => !r)}
            className={`rounded py-1 text-[8px] font-bold uppercase tracking-wider ${
              rapidFire ? "bg-destructive text-destructive-foreground" : "bg-destructive/20 text-destructive"
            }`}
          >
            <Zap className="mr-0.5 inline size-2.5" />RAPID
          </button>
          <div className="flex flex-wrap gap-0.5">
            {history.slice(0, 4).map((h, i) => (
              <span key={i} className={`rounded px-1 text-[8px] font-bold ${
                h.cashed ? "bg-toxic/20 text-toxic" : "bg-destructive/20 text-destructive"
              }`}>{h.cashed ? `${h.mult.toFixed(1)}×` : "✕"}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ───── TALL (mobile portrait, tablet portrait, popout L portrait) ─────
  if (layout === "tall") {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground">
        <main className="relative min-h-0 flex-1">{Game}</main>
        <aside className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-card p-2">
          <div className="flex items-center gap-2">
            <div className="rounded-md border border-border bg-background/60 px-2 py-1">
              <div className="text-[8px] uppercase tracking-widest text-muted-foreground leading-none">Balance</div>
              <div className="font-display text-base leading-tight">${balance.toFixed(2)}</div>
            </div>
            <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1">
              <button onClick={() => adjustBet(-1)} disabled={betLocked}
                className="grid size-7 place-items-center rounded bg-secondary text-foreground active:scale-95 disabled:opacity-40">
                <Minus className="size-3.5" />
              </button>
              <div className="flex-1 text-center">
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground leading-none">Bet</div>
                <div className="font-display text-base leading-tight">${bet.toFixed(2)}</div>
              </div>
              <button onClick={() => adjustBet(1)} disabled={betLocked}
                className="grid size-7 place-items-center rounded bg-primary text-primary-foreground active:scale-95 disabled:opacity-40">
                <Plus className="size-3.5" />
              </button>
            </div>
            <button onClick={() => setSound(s => !s)}
              className="grid size-9 place-items-center rounded-md border border-border bg-secondary">
              {sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 5, 10, 50].map(v => (
              <button key={v} disabled={betLocked} onClick={() => !betLocked && setBet(Math.min(balance, v))}
                className="flex-1 rounded border border-border bg-secondary py-1 text-[10px] font-bold disabled:opacity-40">
                ${v}
              </button>
            ))}
            <button onClick={() => setRapidFire(r => !r)}
              className={`flex-1 rounded border-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                rapidFire
                  ? "border-destructive bg-destructive text-destructive-foreground"
                  : "border-destructive/60 bg-destructive/20 text-destructive"
              }`}>
              <Zap className="mr-0.5 inline size-3" />Rapid
            </button>
            <button onClick={() => { if (!betLocked) { setBalance(1000); setHistory([]); } }} disabled={betLocked}
              className="grid size-7 place-items-center rounded border border-accent/60 bg-accent/20 text-accent disabled:opacity-40">
              <RotateCcw className="size-3" />
            </button>
          </div>
          <div className="flex min-h-[18px] flex-wrap gap-1">
            {history.length === 0 && <span className="text-[9px] text-muted-foreground">No runs yet</span>}
            {history.map((h, i) => (
              <span key={i} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                h.cashed ? "bg-toxic/20 text-toxic" : "bg-destructive/20 text-destructive"
              }`}>{h.cashed ? `${h.mult.toFixed(2)}×` : "✕"}</span>
            ))}
            {lastResult && (
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold ${
                lastResult.type === "win" ? "bg-toxic/20 text-toxic" : "bg-destructive/20 text-destructive"
              }`}>
                {lastResult.type === "win"
                  ? `+$${lastResult.amount.toFixed(2)}`
                  : `−$${lastResult.amount.toFixed(2)}`}
              </span>
            )}
          </div>
        </aside>
      </div>
    );
  }

  // ───── WIDE (desktop, laptop, popout L landscape) ─────
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background text-foreground">
      <aside className="flex w-[clamp(180px,18vw,260px)] shrink-0 flex-col gap-2 overflow-hidden border-r border-border bg-card p-2 lg:p-3">
        <header>
          <h1 className="font-display text-xl tracking-widest leading-none lg:text-2xl">
            ZOMBIE <span style={{ color: "var(--primary)" }}>RUSH</span>
          </h1>
          <p className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">The Base Is Falling</p>
        </header>

        <div className="rounded-md border border-border bg-background/60 p-2">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">Balance</div>
          <div className="font-display text-xl leading-tight">${balance.toFixed(2)}</div>
        </div>

        <div className="rounded-md border border-border bg-background/60 p-2">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Play Amount</div>
          <div className="mt-1 flex items-center gap-1.5">
            <button onClick={() => adjustBet(-1)} disabled={betLocked}
              className="grid size-7 place-items-center rounded bg-secondary text-foreground active:scale-95 disabled:opacity-40">
              <Minus className="size-3.5" />
            </button>
            <div className="flex-1 rounded bg-input px-1 py-1 text-center font-display text-base leading-tight">
              ${bet.toFixed(2)}
            </div>
            <button onClick={() => adjustBet(1)} disabled={betLocked}
              className="grid size-7 place-items-center rounded bg-primary text-primary-foreground active:scale-95 disabled:opacity-40">
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {[1, 5, 10, 50].map(v => (
              <button key={v} disabled={betLocked} onClick={() => !betLocked && setBet(Math.min(balance, v))}
                className="rounded border border-border bg-secondary py-0.5 text-[10px] font-bold disabled:opacity-40">
                ${v}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setRapidFire(r => !r)}
          className={`rounded-md border-2 px-2 py-2 font-display text-sm tracking-wider active:scale-[0.98] ${
            rapidFire
              ? "border-destructive bg-gradient-to-r from-destructive to-primary text-destructive-foreground shadow-[0_0_14px_var(--destructive)]"
              : "border-destructive/60 bg-destructive/20 text-destructive"
          }`}
        >
          <Zap className="mr-1 inline size-3.5" />RAPID FIRE
        </button>

        <button
          onClick={() => { if (!betLocked) { setBalance(1000); setHistory([]); } }}
          disabled={betLocked}
          className="rounded-md border-2 border-accent/60 bg-accent/20 py-2 font-display text-sm tracking-wider text-accent active:scale-[0.98] disabled:opacity-40"
        >
          <RotateCcw className="mr-1 inline size-3.5" />QUICK RESET
        </button>

        {lastResult && (
          <div className={`rounded-md border-2 px-2 py-1.5 text-center font-display text-sm ${
            lastResult.type === "win"
              ? "border-toxic bg-toxic/10 text-toxic"
              : "border-destructive bg-destructive/10 text-destructive"
          }`}>
            {lastResult.type === "win"
              ? `+$${lastResult.amount.toFixed(2)} @ ${lastResult.mult?.toFixed(2)}×`
              : `-$${lastResult.amount.toFixed(2)}`}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background/60 p-1.5">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">Last Runs</div>
          <div className="flex flex-wrap gap-1">
            {history.length === 0 && <span className="text-[10px] text-muted-foreground">No runs yet</span>}
            {history.map((h, i) => (
              <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                h.cashed ? "bg-toxic/20 text-toxic" : "bg-destructive/20 text-destructive"
              }`}>{h.cashed ? `${h.mult.toFixed(2)}×` : "✕"}</span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setSound(s => !s)}
            className="grid size-7 place-items-center rounded border border-border bg-secondary">
            {sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          </button>
          <div className="text-[9px] leading-tight text-muted-foreground">Cash out before the base falls</div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 p-1.5 lg:p-2">{Game}</main>
    </div>
  );
}
