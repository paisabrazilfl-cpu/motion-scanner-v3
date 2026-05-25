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

function ConfigSection({ config }: { config: ScanConfig }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const cfg = config.config as Record<string, unknown>;

  const [rsiOversold, setRsiOversold] = useState(String(cfg.rsiOversold ?? 30));
  const [rsiOverbought, setRsiOverbought] = useState(String(cfg.rsiOverbought ?? 85));
  const [adxThreshold, setAdxThreshold] = useState(String(cfg.adxThreshold ?? 25));
  const [volThreshold, setVolThreshold] = useState(String(cfg.volumeRatioThreshold ?? 1.2));
  const [monteCarloEnabled, setMonteCarloEnabled] = useState(Boolean(cfg.monteCarloEnabled ?? true));
  const [discordEnabled, setDiscordEnabled] = useState(Boolean(cfg.discordEnabled ?? false));
  const [discordWebhook, setDiscordWebhook] = useState(String(cfg.discordWebhook ?? ""));

  const { mutate: update, isPending } = useUpdateConfig({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/config"] });
        toast({ title: "Settings saved" });
      },
    },
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wider">Scan Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {[
            ["RSI Oversold", rsiOversold, setRsiOversold],
            ["RSI Overbought", rsiOverbought, setRsiOverbought],
            ["ADX Threshold", adxThreshold, setAdxThreshold],
            ["Volume Ratio Min", volThreshold, setVolThreshold],
          ].map(([label, val, setter]) => (
            <div key={String(label)} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">{label as string}</Label>
              <Input value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} className="font-mono" />
            </div>
          ))}
        </div>

        <Separator />

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

        <Button onClick={() => update({ data: { config: {
          rsiOversold: Number(rsiOversold), rsiOverbought: Number(rsiOverbought),
          adxThreshold: Number(adxThreshold), volumeRatioThreshold: Number(volThreshold),
          monteCarloEnabled, discordEnabled, discordWebhook: discordEnabled ? discordWebhook : "",
        }}})} disabled={isPending} className="w-full">
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
