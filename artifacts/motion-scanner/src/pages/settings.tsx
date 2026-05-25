import { useState } from "react";
import { useGetConfig, useUpdateConfig, useGetApiKeys, useUpdateApiKeys } from "@workspace/api-client-react";
import type { ScanConfig, ApiKeyStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";

function StatusDot({ configured }: { configured?: boolean }) {
  return configured
    ? <><CheckCircle className="h-4 w-4 text-[hsl(var(--go-color))]" /><span className="text-[hsl(var(--go-color))]">Connected</span></>
    : <><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Not connected</span></>;
}

function num(v: unknown, fallback: number): number {
  const n = parseFloat(String(v ?? ""));
  return isNaN(n) ? fallback : n;
}

function ConfigSection({ config }: { config: ScanConfig }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const raw = config.config as Record<string, unknown>;
  const tcfg = (raw.technical ?? {}) as Record<string, unknown>;
  const rsiBand = (tcfg.rsi_band as [number, number]) ?? [30, 85];

  // ── Base thresholds ──────────────────────────────────────────────────────
  const [rsiOversold, setRsiOversold]     = useState(String(rsiBand[0]));
  const [rsiOverbought, setRsiOverbought] = useState(String(rsiBand[1]));
  const [adxThreshold, setAdxThreshold]   = useState(String(tcfg.adx_threshold ?? 25));
  const [volThreshold, setVolThreshold]   = useState(String(tcfg.volume_ratio_min ?? 1.2));
  const [emaStackReq, setEmaStackReq]     = useState(Boolean(tcfg.ema_stack_required ?? false));

  // ── EMA 10 ───────────────────────────────────────────────────────────────
  const [ema10Filter, setEma10Filter] = useState(Boolean(tcfg.ema10_filter ?? false));

  // ── SMA 20 ───────────────────────────────────────────────────────────────
  const [sma20Filter, setSma20Filter] = useState(Boolean(tcfg.sma20_filter ?? false));

  // ── Full Stochastic ───────────────────────────────────────────────────────
  const [stochFilter, setStochFilter]         = useState(Boolean(tcfg.stoch_filter ?? false));
  const [stochKPeriod, setStochKPeriod]       = useState(String(tcfg.stoch_k_period ?? 14));
  const [stochSlowPeriod, setStochSlowPeriod] = useState(String(tcfg.stoch_slow_period ?? 3));
  const [stochDPeriod, setStochDPeriod]       = useState(String(tcfg.stoch_d_period ?? 3));
  const [stochOversold, setStochOversold]     = useState(String(tcfg.stoch_oversold ?? 20));
  const [stochOverbought, setStochOverbought] = useState(String(tcfg.stoch_overbought ?? 80));

  // ── 3-Month MACD ──────────────────────────────────────────────────────────
  const [macd3mFilter, setMacd3mFilter]               = useState(Boolean(tcfg.macd3m_filter ?? false));
  const [macd3mAboveZero, setMacd3mAboveZero]         = useState(Boolean(tcfg.macd3m_require_above_zero ?? false));
  const [macd3mHistPos, setMacd3mHistPos]             = useState(Boolean(tcfg.macd3m_require_hist_positive ?? false));

  // ── Monte Carlo & Discord ─────────────────────────────────────────────────
  const [monteCarloEnabled, setMonteCarloEnabled] = useState(Boolean(raw.monte_carlo_enabled ?? true));
  const [discordEnabled, setDiscordEnabled]       = useState(Boolean(raw.discord_enabled ?? false));
  const [discordWebhook, setDiscordWebhook]       = useState(String(raw.discord_webhook ?? ""));

  const { mutate: update, isPending } = useUpdateConfig({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/config"] });
        toast({ title: "Settings saved" });
      },
    },
  });

  function handleSave() {
    update({
      data: {
        config: {
          ...raw,
          technical: {
            ...tcfg,
            rsi_band: [num(rsiOversold, 30), num(rsiOverbought, 85)],
            adx_threshold: num(adxThreshold, 25),
            volume_ratio_min: num(volThreshold, 1.2),
            ema_stack_required: emaStackReq,
            ema10_filter: ema10Filter,
            sma20_filter: sma20Filter,
            stoch_filter: stochFilter,
            stoch_k_period: num(stochKPeriod, 14),
            stoch_slow_period: num(stochSlowPeriod, 3),
            stoch_d_period: num(stochDPeriod, 3),
            stoch_oversold: num(stochOversold, 20),
            stoch_overbought: num(stochOverbought, 80),
            macd3m_filter: macd3mFilter,
            macd3m_require_above_zero: macd3mAboveZero,
            macd3m_require_hist_positive: macd3mHistPos,
          },
          monte_carlo_enabled: monteCarloEnabled,
          discord_enabled: discordEnabled,
          discord_webhook: discordEnabled ? discordWebhook : "",
        },
      },
    });
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wider">Scan Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Base thresholds ────────────────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Base Thresholds</div>
          <div className="grid grid-cols-2 gap-4">
            {([
              ["RSI Oversold", rsiOversold, setRsiOversold],
              ["RSI Overbought", rsiOverbought, setRsiOverbought],
              ["ADX Threshold", adxThreshold, setAdxThreshold],
              ["RVOL Min", volThreshold, setVolThreshold],
            ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase">{label}</Label>
                <Input value={val} onChange={(e) => setter(e.target.value)} className="font-mono h-8 text-sm" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4">
            <div>
              <div className="text-sm font-medium">Require EMA Stack (9 &gt; 21 &gt; 50)</div>
              <div className="text-xs text-muted-foreground">HOLD if price is below the EMA stack alignment</div>
            </div>
            <Switch checked={emaStackReq} onCheckedChange={setEmaStackReq} />
          </div>
        </div>

        <Separator />

        {/* ── EMA 10 ────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">EMA 10 Filter</div>
              <div className="text-xs text-muted-foreground">HOLD any ticker where close is below the 10-period EMA</div>
            </div>
            <Switch checked={ema10Filter} onCheckedChange={setEma10Filter} />
          </div>
          {ema10Filter && (
            <div className="mt-3 px-3 py-2 rounded bg-muted/20 text-xs text-muted-foreground font-mono">
              Gate: close &gt; EMA(10) → otherwise HOLD
            </div>
          )}
        </div>

        <Separator />

        {/* ── SMA 20 ────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">SMA 20 Day Filter</div>
              <div className="text-xs text-muted-foreground">HOLD any ticker trading below its 20-day simple moving average</div>
            </div>
            <Switch checked={sma20Filter} onCheckedChange={setSma20Filter} />
          </div>
          {sma20Filter && (
            <div className="mt-3 px-3 py-2 rounded bg-muted/20 text-xs text-muted-foreground font-mono">
              Gate: close &gt; SMA(20) → otherwise HOLD
            </div>
          )}
        </div>

        <Separator />

        {/* ── Full Stochastic ────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Full Stochastic Filter</div>
              <div className="text-xs text-muted-foreground">Slow %K/%D — blocks overbought / allows only oversold entries</div>
            </div>
            <Switch checked={stochFilter} onCheckedChange={setStochFilter} />
          </div>
          {stochFilter && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["%K Period", stochKPeriod, setStochKPeriod],
                  ["Slow %K Period", stochSlowPeriod, setStochSlowPeriod],
                  ["%D Period", stochDPeriod, setStochDPeriod],
                ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                  <div key={label} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase">{label}</Label>
                    <Input value={val} onChange={(e) => setter(e.target.value)} className="font-mono h-8 text-sm" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["Oversold ≤", stochOversold, setStochOversold],
                  ["Overbought ≥", stochOverbought, setStochOverbought],
                ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                  <div key={label} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase">{label}</Label>
                    <Input value={val} onChange={(e) => setter(e.target.value)} className="font-mono h-8 text-sm" />
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 rounded bg-muted/20 text-xs text-muted-foreground font-mono space-y-0.5">
                <div>Slow %K({stochKPeriod},{stochSlowPeriod}) outside [{stochOversold},{stochOverbought}] → HOLD</div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* ── 3-Month MACD ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">3-Month MACD Filter</div>
              <div className="text-xs text-muted-foreground">MACD computed on last ~65 bars (≈3 trading months)</div>
            </div>
            <Switch checked={macd3mFilter} onCheckedChange={setMacd3mFilter} />
          </div>
          {macd3mFilter && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Require MACD Line &gt; 0</div>
                  <div className="text-xs text-muted-foreground">3M MACD must be above zero (bullish momentum)</div>
                </div>
                <Switch checked={macd3mAboveZero} onCheckedChange={setMacd3mAboveZero} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Require Histogram Positive</div>
                  <div className="text-xs text-muted-foreground">MACD line must be above signal line (accelerating)</div>
                </div>
                <Switch checked={macd3mHistPos} onCheckedChange={setMacd3mHistPos} />
              </div>
              <div className="px-3 py-2 rounded bg-muted/20 text-xs text-muted-foreground font-mono space-y-0.5">
                {macd3mAboveZero && <div>3M MACD &gt; 0 → otherwise HOLD</div>}
                {macd3mHistPos   && <div>3M MACD Hist &gt; 0 → otherwise HOLD</div>}
                {!macd3mAboveZero && !macd3mHistPos && <div>Filter enabled — select a condition above</div>}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* ── Monte Carlo & Notifications ────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Monte Carlo Simulation</div>
              <div className="text-xs text-muted-foreground">500-run probabilistic hold-period scoring</div>
            </div>
            <Switch checked={monteCarloEnabled} onCheckedChange={setMonteCarloEnabled} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Discord Notifications</div>
              <div className="text-xs text-muted-foreground">Send GO signals to a webhook</div>
            </div>
            <Switch checked={discordEnabled} onCheckedChange={setDiscordEnabled} />
          </div>
          {discordEnabled && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">Discord Webhook URL</Label>
              <Input value={discordWebhook} onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..." className="font-mono text-xs" />
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={isPending} className="w-full">
          {isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ProviderRowProps {
  name: string;
  description: string;
  configured?: boolean;
  signupUrl: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyValue: string;
  onKeyChange: (v: string) => void;
  secretLabel?: string;
  secretPlaceholder?: string;
  secretValue?: string;
  onSecretChange?: (v: string) => void;
  extra?: React.ReactNode;
}

function ProviderRow(p: ProviderRowProps) {
  return (
    <div className="rounded border border-border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground">{p.description}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <StatusDot configured={p.configured} />
          </div>
          <a href={p.signupUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <ExternalLink className="h-3 w-3" />Sign up
          </a>
        </div>
      </div>
      <div className={`grid gap-3 ${p.secretLabel ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase">{p.keyLabel}</Label>
          <Input type="password" value={p.keyValue} onChange={(e) => p.onKeyChange(e.target.value)}
            placeholder={p.configured ? "••••••••••••" : p.keyPlaceholder} className="font-mono text-xs" />
        </div>
        {p.secretLabel && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase">{p.secretLabel}</Label>
            <Input type="password" value={p.secretValue ?? ""} onChange={(e) => p.onSecretChange?.(e.target.value)}
              placeholder={p.configured ? "••••••••••••" : (p.secretPlaceholder ?? "")} className="font-mono text-xs" />
          </div>
        )}
      </div>
      {p.extra}
    </div>
  );
}

function ApiKeysSection({ keys }: { keys: ApiKeyStatus }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [alpacaApiKey, setAlpacaApiKey] = useState("");
  const [alpacaSecretKey, setAlpacaSecretKey] = useState("");
  const [alpacaPaper, setAlpacaPaper] = useState(keys.alpacaPaper ?? true);
  const [polygonApiKey, setPolygonApiKey] = useState("");
  const [finnhubApiKey, setFinnhubApiKey] = useState("");

  const { mutate: update, isPending } = useUpdateApiKeys({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/api-keys"] });
        toast({ title: "API keys saved", description: "All keys encrypted with AES-256-GCM." });
        setAlpacaApiKey(""); setAlpacaSecretKey(""); setPolygonApiKey(""); setFinnhubApiKey("");
      },
    },
  });

  const hasChanges = alpacaApiKey || alpacaSecretKey || polygonApiKey || finnhubApiKey;

  const handleSave = () => {
    update({
      data: {
        alpacaApiKey: alpacaApiKey || undefined,
        alpacaSecretKey: alpacaSecretKey || undefined,
        alpacaPaper,
        polygonApiKey: polygonApiKey || undefined,
        finnhubApiKey: finnhubApiKey || undefined,
      },
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wider">Data Providers & API Keys</CardTitle>
          <Badge variant="outline" className="text-xs text-muted-foreground">AES-256-GCM Encrypted</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Yahoo Finance — always active */}
        <div className="rounded border border-[hsl(var(--go-color))]/20 bg-[hsl(var(--go-color))]/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Yahoo Finance</div>
              <div className="text-xs text-muted-foreground">OHLCV data, EMA stack, RSI, ATR, RVOL, fundamentals — always active, no key needed</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCircle className="h-4 w-4 text-[hsl(var(--go-color))]" />
              <span className="text-[hsl(var(--go-color))]">Always active</span>
            </div>
          </div>
        </div>

        <ProviderRow
          name="Polygon.io"
          description="Real-time quotes, options flow (P/C ratio, IV, call/put volumes), news headlines"
          configured={keys.polygonConfigured}
          signupUrl="https://polygon.io"
          keyLabel="API Key"
          keyPlaceholder="Enter Polygon API key..."
          keyValue={polygonApiKey}
          onKeyChange={setPolygonApiKey}
        />

        <ProviderRow
          name="Finnhub"
          description="Real-time quote, news sentiment score, earnings calendar, EPS surprise, company profile"
          configured={keys.finnhubConfigured}
          signupUrl="https://finnhub.io"
          keyLabel="API Key"
          keyPlaceholder="Enter Finnhub API key..."
          keyValue={finnhubApiKey}
          onKeyChange={setFinnhubApiKey}
        />

        <ProviderRow
          name="Alpaca Paper Trading"
          description="Automated paper trade execution, account positions, P&L"
          configured={keys.alpacaConfigured}
          signupUrl="https://alpaca.markets"
          keyLabel="API Key"
          keyPlaceholder="PKXXXXXXXX..."
          keyValue={alpacaApiKey}
          onKeyChange={setAlpacaApiKey}
          secretLabel="Secret Key"
          secretPlaceholder="Enter secret..."
          secretValue={alpacaSecretKey}
          onSecretChange={setAlpacaSecretKey}
          extra={
            <div className="flex items-center gap-3">
              <Switch checked={alpacaPaper} onCheckedChange={setAlpacaPaper} />
              <div>
                <div className="text-sm">Paper Trading Mode</div>
                <div className="text-xs text-muted-foreground">Use paper trading endpoint (recommended)</div>
              </div>
            </div>
          }
        />

        <Button onClick={handleSave} disabled={isPending || !hasChanges} className="w-full">
          {isPending ? "Saving..." : "Save API Keys"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const { data: config, isLoading: configLoading } = useGetConfig();
  const { data: keys, isLoading: keysLoading } = useGetApiKeys();

  if (configLoading || keysLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      {config && <ConfigSection config={config} />}
      {keys && <ApiKeysSection keys={keys} />}
    </div>
  );
}
