import { useState, useCallback } from "react";
import { useAmfDiscover, useRunAmfScan } from "@workspace/api-client-react";
import type { AmfDiscoverItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Layers, TrendingUp, TrendingDown, AlertCircle, RefreshCw,
  Search, ChevronRight, X,
} from "lucide-react";

// ── Phase metadata ────────────────────────────────────────────────────────────

const LTH_PHASES: Record<string, { label: string; color: string; bg: string; order: number }> = {
  MOMENTUM_TREND:    { label: "MOMENTUM TREND",  color: "text-green-400",        bg: "bg-green-400/10 border-green-400/30",    order: 1 },
  BREAKOUT:          { label: "BREAKOUT",         color: "text-cyan-400",         bg: "bg-cyan-400/10 border-cyan-400/30",      order: 2 },
  REVERSAL:          { label: "REVERSAL",         color: "text-yellow-400",       bg: "bg-yellow-400/10 border-yellow-400/30",  order: 3 },
  ACCUMULATION:      { label: "ACCUMULATION",     color: "text-amber-400",        bg: "bg-amber-400/10 border-amber-400/30",    order: 4 },
  DOWNTREND:         { label: "DOWNTREND",        color: "text-red-400",          bg: "bg-red-400/10 border-red-400/30",        order: 5 },
  NO_SETUP:          { label: "NO SETUP",         color: "text-muted-foreground", bg: "bg-muted/30 border-border",              order: 9 },
  FILTERED:          { label: "FILTERED",         color: "text-muted-foreground", bg: "bg-muted/30 border-border",              order: 10 },
  INSUFFICIENT_DATA: { label: "INSUFF. DATA",     color: "text-muted-foreground", bg: "bg-muted/30 border-border",              order: 11 },
  NO_DATA:           { label: "NO DATA",          color: "text-destructive",      bg: "bg-destructive/10 border-destructive/30",order: 12 },
  ERROR:             { label: "ERROR",            color: "text-destructive",      bg: "bg-destructive/10 border-destructive/30",order: 13 },
};

const HTL_PHASES: Record<string, { label: string; color: string; bg: string; order: number }> = {
  BULL_RUN:          { label: "BULL RUN",         color: "text-green-400",        bg: "bg-green-400/10 border-green-400/30",    order: 1 },
  DISTRIBUTION:      { label: "DISTRIBUTION",     color: "text-yellow-400",       bg: "bg-yellow-400/10 border-yellow-400/30",  order: 2 },
  ROLLOVER:          { label: "ROLLOVER",         color: "text-amber-400",        bg: "bg-amber-400/10 border-amber-400/30",    order: 3 },
  BREAKDOWN:         { label: "BREAKDOWN",        color: "text-orange-400",       bg: "bg-orange-400/10 border-orange-400/30",  order: 4 },
  BEAR_TREND:        { label: "BEAR TREND",       color: "text-red-400",          bg: "bg-red-400/10 border-red-400/30",        order: 5 },
  NO_SETUP:          { label: "NO SETUP",         color: "text-muted-foreground", bg: "bg-muted/30 border-border",              order: 9 },
  FILTERED:          { label: "FILTERED",         color: "text-muted-foreground", bg: "bg-muted/30 border-border",              order: 10 },
  INSUFFICIENT_DATA: { label: "INSUFF. DATA",     color: "text-muted-foreground", bg: "bg-muted/30 border-border",              order: 11 },
  NO_DATA:           { label: "NO DATA",          color: "text-destructive",      bg: "bg-destructive/10 border-destructive/30",order: 12 },
  ERROR:             { label: "ERROR",            color: "text-destructive",      bg: "bg-destructive/10 border-destructive/30",order: 13 },
};

const FALLBACK_PHASE = { label: "UNKNOWN", color: "text-muted-foreground", bg: "bg-muted/30 border-border", order: 99 };

// ── Screen presets ────────────────────────────────────────────────────────────

const SCREENS = [
  { id: "most_actives",             label: "Most Active",          desc: "Highest volume today" },
  { id: "day_gainers",              label: "Day Gainers",          desc: "Top price movers up" },
  { id: "day_losers",               label: "Day Losers",           desc: "Top price movers down" },
  { id: "undervalued_large_caps",   label: "Undervalued L-Cap",    desc: "Large caps, low P/E" },
  { id: "growth_technology_stocks", label: "Growth Technology",    desc: "High-growth tech names" },
  { id: "aggressive_small_caps",    label: "Small Cap Growth",     desc: "Small caps, high momentum" },
  { id: "small_cap_gainers",        label: "Small Cap Gainers",    desc: "Small caps moving up" },
  { id: "strong_undervalued_stocks",label: "Strong Undervalued",   desc: "Value + strong technicals" },
];

const COUNT_OPTIONS = [25, 50, 100];

// ── Period presets ────────────────────────────────────────────────────────────

const PRESETS = [
  { days: 63,  label: "13W" },
  { days: 126, label: "26W" },
  { days: 252, label: "52W" },
  { days: 504, label: "2Y"  },
  { days: 756, label: "3Y"  },
];

function approxWeeks(days: number) {
  const w = Math.round(days / 5);
  if (w >= 52) return `${(w / 52).toFixed(1).replace(/\.0$/, "")}Y`;
  return `${w}W`;
}

// ── Market cap formatter ──────────────────────────────────────────────────────

function fmtMcap(n: number | null | undefined): string {
  if (!n) return "";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return "";
}

// ── Range position bar ────────────────────────────────────────────────────────

function RangeBar({ position }: { position: number }) {
  const pct = Math.max(0, Math.min(1, position)) * 100;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/40 via-yellow-400/40 to-green-400/40 rounded-full" />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 rounded-full transition-all"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

// ── Row card ──────────────────────────────────────────────────────────────────

interface RowCardProps {
  ticker: string;
  phase: string;
  score: number;
  phaseMap: typeof LTH_PHASES;
  close: number;
  periodLow: number;
  periodHigh: number;
  rangePosition: number;
  pctFromLow: number;
  pctToHigh: number;
  rsi14: number;
  roc63: number;
  relVol20: number;
  reason: string;
}

function RowCard({
  ticker, phase, score, phaseMap,
  close, rangePosition, pctFromLow, pctToHigh,
  rsi14, roc63, relVol20, reason,
}: RowCardProps) {
  const meta = phaseMap[phase] ?? FALLBACK_PHASE;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  return (
    <div className={cn("rounded border px-3 py-2.5 space-y-2", meta.bg)}>
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm text-foreground w-16 shrink-0">{ticker}</span>
        <span className={cn("text-xs font-bold tracking-wide", meta.color)}>{meta.label}</span>
        <span className="ml-auto text-xs text-muted-foreground">{score.toFixed(0)}</span>
      </div>
      <RangeBar position={rangePosition} />
      <div className="grid grid-cols-3 gap-x-2 text-xs">
        <div>
          <div className="text-muted-foreground text-[10px]">PRICE</div>
          <div className="text-foreground font-mono">${close.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-[10px]">RSI 14</div>
          <div className={cn("font-mono", rsi14 >= 70 ? "text-red-400" : rsi14 <= 30 ? "text-green-400" : "text-foreground")}>
            {rsi14.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-[10px]">ROC 63</div>
          <div className={cn("font-mono", roc63 >= 0 ? "text-green-400" : "text-red-400")}>
            {pct(roc63)}
          </div>
        </div>
        <div className="mt-1">
          <div className="text-muted-foreground text-[10px]">RVOL</div>
          <div className={cn("font-mono", relVol20 >= 1.5 ? "text-cyan-400" : "text-foreground")}>
            {relVol20.toFixed(2)}x
          </div>
        </div>
        <div className="mt-1">
          <div className="text-muted-foreground text-[10px]">▲ LOW</div>
          <div className="font-mono text-foreground">{pct(pctFromLow)}</div>
        </div>
        <div className="mt-1">
          <div className="text-muted-foreground text-[10px]">▼ HIGH</div>
          <div className="font-mono text-foreground">{pct(pctToHigh)}</div>
        </div>
      </div>
      {reason && (
        <div className="text-[10px] text-muted-foreground truncate" title={reason}>
          {reason}
        </div>
      )}
    </div>
  );
}

// ── Phase summary pills ───────────────────────────────────────────────────────

function PhaseSummary({ rows, phaseMap }: {
  rows: { phase: string }[];
  phaseMap: typeof LTH_PHASES;
}) {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.phase] = (counts[r.phase] ?? 0) + 1;
  const sorted = Object.entries(counts).sort(([a], [b]) =>
    (phaseMap[a]?.order ?? 99) - (phaseMap[b]?.order ?? 99)
  );
  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map(([phase, count]) => {
        const m = phaseMap[phase] ?? FALLBACK_PHASE;
        return (
          <span key={phase} className={cn("text-[10px] px-1.5 py-0.5 rounded border font-mono", m.bg, m.color)}>
            {m.label} {count}
          </span>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Amf() {
  const [selectedScreen, setSelectedScreen] = useState("most_actives");
  const [count, setCount]   = useState(50);
  const [period, setPeriod] = useState(252);
  const [discoveredTickers, setDiscoveredTickers] = useState<string[]>([]);
  const [discoveredItems, setDiscoveredItems] = useState<AmfDiscoverItem[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  const discover = useAmfDiscover(
    { screen: selectedScreen, count },
    { query: { enabled: false, queryKey: ["amf-discover", selectedScreen, count] } },
  );

  const { mutate, isPending, data, error } = useRunAmfScan();

  const handleDiscover = useCallback(async () => {
    const result = await discover.refetch();
    if (result.data) {
      setDiscoveredTickers(result.data.tickers);
      setDiscoveredItems(result.data.items ?? []);
      setHasScanned(false);
    }
  }, [discover]);

  const handleScan = useCallback(() => {
    if (!discoveredTickers.length) return;
    setHasScanned(true);
    mutate({ data: { tickers: discoveredTickers, period } });
  }, [discoveredTickers, period, mutate]);

  const removeTicker = useCallback((sym: string) => {
    setDiscoveredTickers((prev) => prev.filter((t) => t !== sym));
    setDiscoveredItems((prev) => prev.filter((i) => i.symbol !== sym));
  }, []);

  const results = data?.results ?? [];
  const ACTIONABLE_LTH = new Set(["MOMENTUM_TREND", "BREAKOUT", "REVERSAL", "ACCUMULATION", "DOWNTREND"]);
  const ACTIONABLE_HTL = new Set(["BULL_RUN", "DISTRIBUTION", "ROLLOVER", "BREAKDOWN", "BEAR_TREND"]);

  const lthRows = [...results].sort((a, b) => {
    const ao = LTH_PHASES[a.phase]?.order ?? 99;
    const bo = LTH_PHASES[b.phase]?.order ?? 99;
    return ao !== bo ? ao - bo : b.score - a.score;
  });

  const htlRows = [...results].sort((a, b) => {
    const ao = HTL_PHASES[a.mirrorPhase]?.order ?? 99;
    const bo = HTL_PHASES[b.mirrorPhase]?.order ?? 99;
    return ao !== bo ? ao - bo : b.mirrorScore - a.mirrorScore;
  });

  const lthActionable = lthRows.filter((r) => ACTIONABLE_LTH.has(r.phase));
  const htlActionable = htlRows.filter((r) => ACTIONABLE_HTL.has(r.mirrorPhase));

  const weeks     = approxWeeks(period);
  const exactWeeks = Math.round(period / 5);
  const screenLabel = SCREENS.find((s) => s.id === selectedScreen)?.label ?? selectedScreen;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-cyan-400" />
          <div>
            <h1 className="font-bold tracking-tight text-base">A.M.F.</h1>
            <p className="text-xs text-muted-foreground">
              Accumulation Momentum Finder · {period}d ({weeks}) Range Phase Classifier
            </p>
          </div>
        </div>
      </div>

      {/* Setup panel */}
      <div className="border-b border-border px-6 py-4 shrink-0 space-y-5">

        {/* Screen selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            SCREEN — Yahoo Finance Live Feed
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {SCREENS.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedScreen(s.id); setDiscoveredTickers([]); setDiscoveredItems([]); }}
                className={cn(
                  "text-left px-2.5 py-2 rounded border text-xs transition-colors",
                  selectedScreen === s.id
                    ? "bg-cyan-400/10 border-cyan-400/40 text-cyan-300"
                    : "border-border text-muted-foreground hover:border-cyan-400/30 hover:text-foreground"
                )}
              >
                <div className="font-semibold leading-tight">{s.label}</div>
                <div className="text-[10px] opacity-60 mt-0.5 leading-tight">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Count + Period row */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-end">

          {/* Count */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              TICKER COUNT
            </label>
            <div className="flex gap-1">
              {COUNT_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCount(c)}
                  className={cn(
                    "px-4 py-1.5 rounded border text-xs font-mono transition-colors",
                    count === c
                      ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-400 font-bold"
                      : "border-border text-muted-foreground hover:border-cyan-400/30 hover:text-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                LOOKBACK PERIOD
              </label>
              <span className="text-xs font-bold text-cyan-400 font-mono">
                {period}d <span className="text-muted-foreground font-normal">≈ {exactWeeks}W</span>
              </span>
            </div>
            <Slider
              value={[period]}
              onValueChange={([v]) => setPeriod(v)}
              min={63}
              max={756}
              step={21}
              className="w-full"
            />
            <div className="flex gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setPeriod(p.days)}
                  className={cn(
                    "flex-1 text-[10px] font-mono py-1 rounded border transition-colors",
                    period === p.days
                      ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-400 font-bold"
                      : "border-border text-muted-foreground hover:border-cyan-400/30 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleDiscover}
            disabled={discover.isFetching}
            variant="outline"
            size="sm"
            className="font-mono text-xs gap-2 border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10"
          >
            {discover.isFetching
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> FETCHING…</>
              : <><Search className="h-3.5 w-3.5" /> DISCOVER TICKERS</>
            }
          </Button>

          {discoveredTickers.length > 0 && (
            <Button
              onClick={handleScan}
              disabled={isPending}
              size="sm"
              className="font-mono text-xs gap-2"
            >
              {isPending
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> SCANNING…</>
                : <><Layers className="h-3.5 w-3.5" /> RUN A.M.F. SCAN ({discoveredTickers.length})</>
              }
            </Button>
          )}

          {discover.isError && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              Failed to fetch screen
            </span>
          )}
        </div>

        {/* Discovered tickers chips */}
        {discoveredTickers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {discoveredTickers.length} TICKERS — {screenLabel}
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Click × to remove before scanning</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
              {discoveredItems.map((item) => (
                <span
                  key={item.symbol}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-card text-[10px] font-mono group hover:border-destructive/40 transition-colors"
                >
                  <span className="font-bold text-foreground">{item.symbol}</span>
                  <span className="text-muted-foreground">${item.regularMarketPrice.toFixed(2)}</span>
                  {item.marketCap && (
                    <span className="text-muted-foreground/60">{fmtMcap(item.marketCap)}</span>
                  )}
                  <button
                    onClick={() => removeTicker(item.symbol)}
                    className="ml-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
                    title={`Remove ${item.symbol}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 text-xs text-destructive border border-destructive/30 rounded px-3 py-2 bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {String(error)}
        </div>
      )}

      {/* Empty state */}
      {!hasScanned && !isPending && discoveredTickers.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-10 h-10 rounded-full bg-cyan-400/10 flex items-center justify-center">
            <Layers className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Select a screen and discover tickers</p>
            <p className="text-xs text-muted-foreground mt-1">
              Yahoo Finance feeds live U.S. equity tickers · No manual entry required
            </p>
          </div>
          <button
            onClick={handleDiscover}
            disabled={discover.isFetching}
            className="text-xs text-cyan-400 underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            {discover.isFetching ? "Fetching…" : `Discover ${count} tickers from "${screenLabel}"`}
          </button>
        </div>
      )}

      {/* Scanning spinner */}
      {isPending && (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-xs">
          <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
          Fetching OHLCV data and classifying {discoveredTickers.length} tickers…
        </div>
      )}

      {/* Results */}
      {hasScanned && !isPending && results.length > 0 && (
        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* LOW → HIGH panel */}
            <div className="flex flex-col overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs font-bold text-foreground tracking-wide">LOW → HIGH</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{lthActionable.length} actionable</span>
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  DOWNTREND → ACCUMULATION → REVERSAL → BREAKOUT → MOMENTUM TREND
                </div>
                <PhaseSummary rows={lthRows} phaseMap={LTH_PHASES} />
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {lthRows.map((row) => (
                  <RowCard
                    key={row.ticker}
                    ticker={row.ticker}
                    phase={row.phase}
                    score={row.score}
                    phaseMap={LTH_PHASES}
                    close={row.close}
                    periodLow={row.periodLow}
                    periodHigh={row.periodHigh}
                    rangePosition={row.rangePosition}
                    pctFromLow={row.pctFromLow}
                    pctToHigh={row.pctToHigh}
                    rsi14={row.rsi14}
                    roc63={row.roc63}
                    relVol20={row.relVol20}
                    reason={row.reason}
                  />
                ))}
              </div>
            </div>

            {/* HIGH → LOW mirror panel */}
            <div className="flex flex-col overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-xs font-bold text-foreground tracking-wide">
                    HIGH → LOW <span className="text-muted-foreground font-normal">(MIRROR)</span>
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{htlActionable.length} actionable</span>
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  BULL RUN → DISTRIBUTION → ROLLOVER → BREAKDOWN → BEAR TREND
                </div>
                <PhaseSummary rows={htlRows.map((r) => ({ phase: r.mirrorPhase }))} phaseMap={HTL_PHASES} />
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {htlRows.map((row) => (
                  <RowCard
                    key={row.ticker}
                    ticker={row.ticker}
                    phase={row.mirrorPhase}
                    score={row.mirrorScore}
                    phaseMap={HTL_PHASES}
                    close={row.close}
                    periodLow={row.periodLow}
                    periodHigh={row.periodHigh}
                    rangePosition={row.rangePosition}
                    pctFromLow={row.pctFromLow}
                    pctToHigh={row.pctToHigh}
                    rsi14={row.rsi14}
                    roc63={row.roc63}
                    relVol20={row.relVol20}
                    reason={row.mirrorReason}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {hasScanned && !isPending && results.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          No results returned.
        </div>
      )}
    </div>
  );
}
