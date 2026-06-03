import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type AreaData,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  ColorType,
} from "lightweight-charts";
import { useGetChart } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ChartType = "candle" | "line" | "area";
type Range = "1mo" | "3mo" | "6mo" | "1y" | "2y";

const CHART_THEME = {
  background: "transparent",
  textColor: "hsl(215 20% 65%)",
  gridColor: "rgba(255,255,255,0.05)",
  borderColor: "rgba(255,255,255,0.08)",
  upColor: "#22d35e",
  downColor: "#ef4444",
  wickUpColor: "#22d35e",
  wickDownColor: "#ef4444",
  lineColor: "#22d35e",
  areaTop: "rgba(34,211,94,0.25)",
  areaBottom: "rgba(34,211,94,0.0)",
  volUp: "rgba(34,211,94,0.4)",
  volDown: "rgba(239,68,68,0.4)",
};

const RANGES: { label: string; value: Range }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
];

interface CrosshairInfo {
  time?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  change?: number;
  changePct?: number;
}

export function TickerChart({ ticker }: { ticker: string }) {
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [range, setRange] = useState<Range>("3mo");
  const [crosshair, setCrosshair] = useState<CrosshairInfo>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const { data, isLoading } = useGetChart(ticker, { range }, {
    query: { queryKey: [`/api/chart/${ticker}`, range], staleTime: 5 * 60 * 1000 },
  });

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    let chart: IChartApi;
    try {
      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: CHART_THEME.textColor,
          fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: CHART_THEME.gridColor },
          horzLines: { color: CHART_THEME.gridColor },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: CHART_THEME.borderColor },
        timeScale: {
          borderColor: CHART_THEME.borderColor,
          timeVisible: true,
          secondsVisible: false,
        },
        width: containerRef.current.clientWidth || 600,
        height: 320,
      });
    } catch {
      return;
    }
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chart) {
        try { chart.applyOptions({ width: entry.contentRect.width }); } catch {}
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current = null;
    };
  }, []);

  // Rebuild series whenever chartType changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    try {
    // Remove existing series
    if (mainSeriesRef.current) { try { chart.removeSeries(mainSeriesRef.current); } catch {} mainSeriesRef.current = null; }
    if (volSeriesRef.current) { try { chart.removeSeries(volSeriesRef.current); } catch {} volSeriesRef.current = null; }

    // Volume histogram (always shown, scaled separately)
    const volSeries = chart.addSeries(HistogramSeries, {
      color: CHART_THEME.volUp,
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volSeriesRef.current = volSeries;

    // Main price series
    if (chartType === "candle") {
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: CHART_THEME.upColor,
        downColor: CHART_THEME.downColor,
        borderUpColor: CHART_THEME.upColor,
        borderDownColor: CHART_THEME.downColor,
        wickUpColor: CHART_THEME.wickUpColor,
        wickDownColor: CHART_THEME.wickDownColor,
      });
      mainSeriesRef.current = cs as ISeriesApi<"Candlestick">;
    } else if (chartType === "line") {
      const ls = chart.addSeries(LineSeries, {
        color: CHART_THEME.lineColor,
        lineWidth: 2,
        priceLineVisible: true,
      });
      mainSeriesRef.current = ls as ISeriesApi<"Line">;
    } else {
      const as = chart.addSeries(AreaSeries, {
        lineColor: CHART_THEME.lineColor,
        topColor: CHART_THEME.areaTop,
        bottomColor: CHART_THEME.areaBottom,
        lineWidth: 2,
      });
      mainSeriesRef.current = as as ISeriesApi<"Area">;
    }

    // Subscribe to crosshair
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !mainSeriesRef.current) {
        setCrosshair({});
        return;
      }
      const d = param.seriesData.get(mainSeriesRef.current);
      if (!d) return;
      const ts = typeof param.time === "number" ? new Date(param.time * 1000).toLocaleDateString() : String(param.time);
      if (chartType === "candle") {
        const cd = d as CandlestickData;
        const chg = cd.close - cd.open;
        const pct = cd.open > 0 ? (chg / cd.open) * 100 : 0;
        setCrosshair({ time: ts, open: cd.open, high: cd.high, low: cd.low, close: cd.close, change: chg, changePct: pct });
      } else {
        const ld = d as LineData | AreaData;
        setCrosshair({ time: ts, close: ld.value });
      }
    });
    } catch {
      // lightweight-charts throws non-Error strings for invariant violations
      // (disposed series, race conditions). Swallow — the chart recovers on the
      // next dependency update.
    }
  }, [chartType]);

  // Feed data whenever it or chart type changes
  useEffect(() => {
    if (!data?.candles || !mainSeriesRef.current || !volSeriesRef.current) return;
    const candles = data.candles;

    try {
      if (chartType === "candle") {
        const series = mainSeriesRef.current as ISeriesApi<"Candlestick">;
        series.setData(candles.map((c) => ({
          time: c.time as CandlestickData["time"],
          open: c.open, high: c.high, low: c.low, close: c.close,
        })));
      } else {
        const series = mainSeriesRef.current as ISeriesApi<"Line"> | ISeriesApi<"Area">;
        series.setData(candles.map((c) => ({
          time: c.time as LineData["time"],
          value: c.close,
        })));
      }

      volSeriesRef.current.setData(candles.map((c) => ({
        time: c.time as HistogramData["time"],
        value: c.volume,
        color: c.close >= c.open ? CHART_THEME.volUp : CHART_THEME.volDown,
      })));

      chartRef.current?.timeScale().fitContent();

      // Set last bar as initial crosshair state
      const last = candles[candles.length - 1];
      if (last) {
        const chg = last.close - last.open;
        const pct = last.open > 0 ? (chg / last.open) * 100 : 0;
        setCrosshair({
          time: new Date(last.time * 1000).toLocaleDateString(),
          open: last.open, high: last.high, low: last.low, close: last.close,
          change: chg, changePct: pct,
        });
      }
    } catch {
      // See note above — swallow lightweight-charts non-Error throws.
    }
  }, [data, chartType]);

  const fmt = (n?: number, d = 2) => (n != null ? n.toFixed(d) : "—");
  const chgColor = (crosshair.change ?? 0) >= 0 ? "text-[hsl(var(--go-color))]" : "text-red-400";

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Chart type */}
        <ToggleGroup type="single" value={chartType} onValueChange={(v) => v && setChartType(v as ChartType)}
          className="gap-1">
          {(["candle", "line", "area"] as ChartType[]).map((t) => (
            <ToggleGroupItem key={t} value={t}
              className="h-7 px-3 text-xs font-mono data-[state=on]:bg-muted data-[state=on]:text-foreground text-muted-foreground border border-border rounded">
              {t === "candle" ? "☯ Candle" : t === "line" ? "∼ Line" : "◠ Area"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Range */}
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button key={r.value} variant="ghost" size="sm"
              onClick={() => setRange(r.value)}
              className={`h-7 px-2.5 text-xs font-mono ${range === r.value ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* OHLCV info bar */}
      {crosshair.time && (
        <div className="flex items-center gap-4 text-xs font-mono px-1 flex-wrap">
          <span className="text-muted-foreground">{crosshair.time}</span>
          {crosshair.open != null && <>
            <span>O <span className="text-foreground">{fmt(crosshair.open)}</span></span>
            <span>H <span className="text-foreground">{fmt(crosshair.high)}</span></span>
            <span>L <span className="text-foreground">{fmt(crosshair.low)}</span></span>
            <span>C <span className="text-foreground">{fmt(crosshair.close)}</span></span>
          </>}
          {crosshair.change != null && (
            <span className={chgColor}>
              {crosshair.change >= 0 ? "+" : ""}{fmt(crosshair.change)} ({crosshair.change >= 0 ? "+" : ""}{fmt(crosshair.changePct, 2)}%)
            </span>
          )}
          {crosshair.volume != null && (
            <span className="text-muted-foreground">V {(crosshair.volume / 1e6).toFixed(2)}M</span>
          )}
        </div>
      )}

      {/* Chart container */}
      <div className="relative rounded border border-border overflow-hidden bg-background/30">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <div className="space-y-2 w-full px-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full" />
      </div>
    </div>
  );
}
