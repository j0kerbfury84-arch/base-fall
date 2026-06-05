import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ZombieRushCanvas } from "@/game/ZombieRushCanvas";
import { Minus, Plus, Volume2, VolumeX, Zap, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zombie Rush 2 — The Base Is Falling" },
      { name: "description", content: "Survive the zombie siege. Cash out before the base falls — a cinematic crash-style defense game." },
      { property: "og:title", content: "Zombie Rush 2 — The Base Is Falling" },
      { property: "og:description", content: "Survive the zombie siege. Cash out before the base falls." },
    ],
  }),
  component: Index,
});

function Index() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(1);
  const [rapidFire, setRapidFire] = useState(false);
  const [sound, setSound] = useState(true);
  const [lastResult, setLastResult] = useState<{ type: "win" | "loss"; amount: number; mult?: number } | null>(null);
  const [history, setHistory] = useState<{ mult: number; cashed: boolean }[]>([]);

  // Deduct bet when game starts handled here; we treat each start as bet deducted
  const [betLocked, setBetLocked] = useState(false);

  const handleStart = () => {
    if (balance < bet) return;
    setBalance(b => b - bet);
    setBetLocked(true);
  };

  const handleCashout = (mult: number) => {
    const win = bet * mult;
    setBalance(b => b + win);
    setLastResult({ type: "win", amount: win, mult });
    setHistory(h => [{ mult, cashed: true }, ...h].slice(0, 8));
    setBetLocked(false);
  };

  const handleCrash = () => {
    setLastResult({ type: "loss", amount: bet });
    setHistory(h => [{ mult: 0, cashed: false }, ...h].slice(0, 8));
    setBetLocked(false);
  };

  // Wire start button to canvas via custom event
  const startGame = () => {
    handleStart();
    const wrap = document.querySelector("[data-zr-wrap]") as HTMLElement | null;
    wrap?.dispatchEvent(new Event("zr-start"));
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

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* SIDEBAR / TOP BAR */}
      <aside className="order-2 flex w-full flex-col gap-3 border-t border-border bg-card p-3 lg:order-1 lg:w-72 lg:border-r lg:border-t-0 lg:p-4">
        <header className="hidden lg:block">
          <h1 className="font-display text-2xl tracking-widest">
            ZOMBIE <span style={{ color: "var(--primary)" }}>RUSH</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">The Base Is Falling</p>
        </header>

        {/* Balance */}
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balance</div>
          <div className="font-display text-2xl text-foreground">${balance.toFixed(2)}</div>
        </div>

        {/* Bet */}
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Play Amount</div>
          <div className="mt-1 flex items-center gap-2">
            <button onClick={() => adjustBet(-1)} disabled={betLocked}
              className="grid size-9 place-items-center rounded-md border border-border bg-secondary text-foreground transition active:scale-95 disabled:opacity-40">
              <Minus className="size-4" />
            </button>
            <div className="flex-1 rounded-md bg-input px-2 py-2 text-center font-display text-xl">
              ${bet.toFixed(2)}
            </div>
            <button onClick={() => adjustBet(1)} disabled={betLocked}
              className="grid size-9 place-items-center rounded-md border border-border bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {[1, 5, 10, 50].map(v => (
              <button key={v} disabled={betLocked} onClick={() => !betLocked && setBet(Math.min(balance, v))}
                className="rounded border border-border bg-secondary py-1 text-xs font-bold transition hover:bg-muted disabled:opacity-40">
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* Mode buttons */}
        <button
          onClick={() => setRapidFire(r => !r)}
          className={`rounded-lg border-2 px-3 py-3 font-display text-lg tracking-wider transition active:scale-[0.98] ${
            rapidFire
              ? "border-destructive bg-gradient-to-r from-destructive to-primary text-destructive-foreground shadow-[0_0_18px_var(--destructive)]"
              : "border-destructive/60 bg-destructive/20 text-destructive"
          }`}
        >
          <Zap className="mr-1 inline size-4" /> RAPID FIRE
        </button>

        <button
          onClick={() => {
            if (!betLocked) {
              setBalance(1000);
              setHistory([]);
            }
          }}
          disabled={betLocked}
          className="rounded-lg border-2 border-accent/60 bg-accent/20 py-3 font-display text-lg tracking-wider text-accent transition active:scale-[0.98] disabled:opacity-40"
        >
          <RotateCcw className="mr-1 inline size-4" /> QUICK RESET
        </button>

        {/* Last result */}
        {lastResult && (
          <div
            className={`animate-fade-in rounded-lg border-2 px-3 py-2 text-center font-display text-lg ${
              lastResult.type === "win"
                ? "border-toxic bg-toxic/10 text-toxic"
                : "border-destructive bg-destructive/10 text-destructive"
            }`}
          >
            {lastResult.type === "win"
              ? `+$${lastResult.amount.toFixed(2)} @ ${lastResult.mult?.toFixed(2)}×`
              : `BASE LOST · -$${lastResult.amount.toFixed(2)}`}
          </div>
        )}

        {/* History */}
        <div className="rounded-lg border border-border bg-background/60 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Last Runs</div>
          <div className="flex flex-wrap gap-1">
            {history.length === 0 && <span className="text-xs text-muted-foreground">No runs yet</span>}
            {history.map((h, i) => (
              <span
                key={i}
                className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                  h.cashed ? "bg-toxic/20 text-toxic" : "bg-destructive/20 text-destructive"
                }`}
              >
                {h.cashed ? `${h.mult.toFixed(2)}×` : "✕"}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="mt-auto flex items-center gap-2">
          <button onClick={() => setSound(s => !s)}
            className="grid size-9 place-items-center rounded-md border border-border bg-secondary text-foreground">
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <div className="text-[10px] text-muted-foreground">
            Survive longer · cash out before the base falls
          </div>
        </div>
      </aside>

      {/* GAME AREA */}
      <main className="relative order-1 flex flex-1 items-center justify-center p-2 lg:order-2 lg:p-4">
        <div className="relative aspect-[3/4] w-full max-w-[520px] sm:aspect-[4/5] lg:aspect-auto lg:h-[min(90vh,900px)] lg:max-w-[700px]" data-zr-wrap>
          <CanvasWrapper bet={bet} balance={balance} onCashout={handleCashout} onCrash={handleCrash} rapidFire={rapidFire} onStartClick={startGame} betLocked={betLocked} />
        </div>
      </main>
    </div>
  );
}

function CanvasWrapper(props: {
  bet: number;
  balance: number;
  onCashout: (m: number) => void;
  onCrash: () => void;
  rapidFire: boolean;
  onStartClick: () => void;
  betLocked: boolean;
}) {
  // Intercept the inner DEPLOY click by listening for game start through wrapper
  // We re-render canvas only when bet/balance changes between rounds (not mid-run)
  return (
    <ZRCanvasShell {...props} />
  );
}

function ZRCanvasShell({ bet, balance, onCashout, onCrash, rapidFire, onStartClick, betLocked }: {
  bet: number; balance: number; onCashout: (m: number) => void; onCrash: () => void; rapidFire: boolean; onStartClick: () => void; betLocked: boolean;
}) {
  return (
    <div
      ref={(el) => {
        if (el) el.setAttribute("data-zr-wrap", "true");
      }}
      className="h-full w-full"
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-deploy-btn]")) {
          // handled by inner button
        }
      }}
    >
      <ZombieRushCanvas
        bet={bet}
        balance={balance}
        onCashout={onCashout}
        onCrash={onCrash}
        rapidFire={rapidFire}
        // override deploy: when user clicks deploy in overlay, we also lock bet
        // We patch by listening for our own event below
        key={`${betLocked}`}
      />
    </div>
  );
}
