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
import { CheckCircle, XCircle } from "lucide-react";

function ConfigSection({ config }: { config: ScanConfig }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const cfg = config.config as Record<string, unknown>;

  const [rsiOversold, setRsiOversold] = useState(String(cfg.rsiOversold ?? 30));
  const [rsiOverbought, setRsiOverbought] = useState(String(cfg.rsiOverbought ?? 70));
  const [adxThreshold, setAdxThreshold] = useState(String(cfg.adxThreshold ?? 25));
  const [volThreshold, setVolThreshold] = useState(String(cfg.volumeRatioThreshold ?? 1.2));
  const [monteCarloEnabled, setMonteCarloEnabled] = useState(Boolean(cfg.monteCarloEnabled ?? true));
  const [discordEnabled, setDiscordEnabled] = useState(Boolean(cfg.discordEnabled ?? false));
  const [discordWebhook, setDiscordWebhook] = useState(String(cfg.discordWebhook ?? ""));

  const { mutate: update, isPending } = useUpdateConfig({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/config"] });
        toast({ title: "Settings saved", description: "Scan configuration updated." });
      },
    },
  });

  const handleSave = () => {
    update({
      data: {
        config: {
          rsiOversold: Number(rsiOversold),
          rsiOverbought: Number(rsiOverbought),
          adxThreshold: Number(adxThreshold),
          volumeRatioThreshold: Number(volThreshold),
          monteCarloEnabled,
          discordEnabled,
          discordWebhook: discordEnabled ? discordWebhook : "",
        },
      },
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wider">Scan Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">RSI Oversold</Label>
            <Input value={rsiOversold} onChange={(e) => setRsiOversold(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">RSI Overbought</Label>
            <Input value={rsiOverbought} onChange={(e) => setRsiOverbought(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">ADX Threshold</Label>
            <Input value={adxThreshold} onChange={(e) => setAdxThreshold(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">Volume Ratio Threshold</Label>
            <Input value={volThreshold} onChange={(e) => setVolThreshold(e.target.value)} className="font-mono" />
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Monte Carlo Simulation</div>
              <div className="text-xs text-muted-foreground">Run probabilistic scoring on each ticker</div>
            </div>
            <Switch checked={monteCarloEnabled} onCheckedChange={setMonteCarloEnabled} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Discord Notifications</div>
              <div className="text-xs text-muted-foreground">Send GO signals to a Discord channel</div>
            </div>
            <Switch checked={discordEnabled} onCheckedChange={setDiscordEnabled} />
          </div>
          {discordEnabled && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase">Discord Webhook URL</Label>
              <Input
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="font-mono text-xs"
              />
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

function ApiKeysSection({ keys }: { keys: ApiKeyStatus }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [alpacaApiKey, setAlpacaApiKey] = useState("");
  const [alpacaSecretKey, setAlpacaSecretKey] = useState("");
  const [alpacaPaper, setAlpacaPaper] = useState(keys.alpacaPaper ?? true);

  const { mutate: update, isPending } = useUpdateApiKeys({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/keys"] });
        toast({ title: "API keys saved", description: "Keys are AES-256-GCM encrypted at rest." });
        setAlpacaApiKey("");
        setAlpacaSecretKey("");
      },
    },
  });

  const handleSave = () => {
    update({
      data: {
        alpacaApiKey: alpacaApiKey || undefined,
        alpacaSecretKey: alpacaSecretKey || undefined,
        alpacaPaper,
      },
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wider">API Keys</CardTitle>
          <Badge variant="outline" className="text-xs text-muted-foreground">AES-256-GCM Encrypted</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Alpaca Paper Trading</div>
              <div className="text-xs text-muted-foreground">Paper trading account for automated execution</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {keys.alpacaConfigured ? (
                <><CheckCircle className="h-4 w-4 text-[hsl(var(--go-color))]" /> <span className="text-[hsl(var(--go-color))]">Connected</span></>
              ) : (
                <><XCircle className="h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground">Not connected</span></>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">API Key</Label>
              <Input
                type="password"
                value={alpacaApiKey}
                onChange={(e) => setAlpacaApiKey(e.target.value)}
                placeholder={keys.alpacaConfigured ? "••••••••••••" : "PKXXXXXXXX..."}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">Secret Key</Label>
              <Input
                type="password"
                value={alpacaSecretKey}
                onChange={(e) => setAlpacaSecretKey(e.target.value)}
                placeholder={keys.alpacaConfigured ? "••••••••••••" : "Enter secret..."}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={alpacaPaper} onCheckedChange={setAlpacaPaper} />
            <div>
              <div className="text-sm">Paper Trading Mode</div>
              <div className="text-xs text-muted-foreground">Use paper trading endpoint (recommended)</div>
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={isPending || (!alpacaApiKey && !alpacaSecretKey)}
          className="w-full"
        >
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
        <Skeleton className="h-48 w-full" />
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
