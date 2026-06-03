import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation, Link } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Activity, BarChart2, Bot, TrendingUp, Zap } from "lucide-react";
import { Layout } from "@/components/layout";
import { Dashboard } from "@/pages/dashboard";
import { Scanner } from "@/pages/scanner";
import { SectorRotation } from "@/pages/sector";
import { Watchlists } from "@/pages/watchlists";
import { Broker } from "@/pages/broker";
import { History } from "@/pages/history";
import { AuditLogs } from "@/pages/audit";
import { Settings } from "@/pages/settings";
import { News } from "@/pages/news";
import { Notes } from "@/pages/notes";
import { Charts } from "@/pages/charts";
import { Agent } from "@/pages/agent";
import { Amf } from "@/pages/amf";
import NotFound from "@/pages/not-found";

// ── QueryClient singleton ─────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

// ── Clerk setup ───────────────────────────────────────────────────────────────

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// REQUIRED — resolves the key from window.location.hostname
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (intentional), auto-set in prod
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

// ── Clerk appearance ──────────────────────────────────────────────────────────

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
  },
  variables: {
    colorPrimary: "#a8c4e0",
    colorForeground: "#d8e3f0",
    colorMutedForeground: "#a6b6ca",
    colorDanger: "#e05c5c",
    colorBackground: "#071428",
    colorInput: "#0f1f38",
    colorInputForeground: "#d8e3f0",
    colorNeutral: "#33496a",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#071428] border border-[#33496a] rounded w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#d8e3f0] font-bold",
    headerSubtitle: "text-[#a6b6ca]",
    socialButtonsBlockButtonText: "text-[#d8e3f0] font-medium",
    formFieldLabel: "text-[#a6b6ca] text-xs uppercase tracking-wider",
    footerActionLink: "text-[#5fa8d3]",
    footerActionText: "text-[#a6b6ca]",
    dividerText: "text-[#a6b6ca]",
    identityPreviewEditButton: "text-[#5fa8d3]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#d8e3f0]",
    logoBox: "mb-2",
    logoImage: "h-9 w-auto",
    socialButtonsBlockButton: "border-[#33496a] bg-[#0f1f38] hover:bg-[#33496a] text-[#d8e3f0]",
    formButtonPrimary: "bg-[#2b5d94] hover:bg-[#356eaa] text-white",
    formFieldInput: "bg-[#0f1f38] border-[#33496a] text-[#d8e3f0] text-sm",
    footerAction: "border-t border-[#33496a]",
    dividerLine: "bg-[#33496a]",
    alert: "border-[#33496a] bg-[#0f1f38]",
    otpCodeFieldInput: "bg-[#0f1f38] border-[#33496a] text-[#d8e3f0]",
    formFieldRow: "",
    main: "",
  },
};

// ── Landing page (public) ─────────────────────────────────────────────────────

function LandingPage() {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background text-foreground font-mono">
      <header className="border-b border-border px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[hsl(var(--go-color))]" />
          <span className="font-bold tracking-tight text-sm">MOTION SCANNER</span>
        </div>
        <div className="flex gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm" className="text-xs font-mono">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="text-xs font-mono">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-10">
        <div className="inline-flex items-center gap-2 border border-green-500/30 rounded px-3 py-1 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          Live Market Intelligence · v3.0
        </div>

        <div className="space-y-5">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Tri-State Stock Scanner
          </h1>
          <div className="flex items-center justify-center gap-5 text-xl font-bold">
            <span className="text-[hsl(var(--go-color))]">GO</span>
            <span className="text-border text-base">·</span>
            <span className="text-[hsl(var(--hold-color))]">HOLD</span>
            <span className="text-border text-base">·</span>
            <span className="text-[hsl(var(--abort-color))]">ABORT</span>
          </div>
          <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
            RSI · ADX · EMA · Volume analysis with an AI-powered autonomous market agent.
            Multi-tenant, SOC 2-aligned, AES-256-GCM encrypted.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="font-mono text-sm gap-2 w-full sm:w-auto">
              <Zap className="h-4 w-4" /> Get Started Free
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="font-mono text-sm w-full sm:w-auto">
              Sign In
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 max-w-2xl w-full text-left">
          {[
            { Icon: BarChart2, label: "Technical Scanner", desc: "RSI, ADX, EMA composite scoring with live GO/HOLD/ABORT signals across any watchlist." },
            { Icon: Bot, label: "AI Agent", desc: "GPT-5 with live tool access — runs real scans, loads watchlists, and analyzes sector data autonomously." },
            { Icon: TrendingUp, label: "Sector Rotation", desc: "Live sector leadership/laggard classification and RISK_ON / RISK_OFF / NEUTRAL regime detection." },
          ].map(({ Icon, label, desc }) => (
            <div key={label} className="border border-border rounded p-4 bg-card text-left">
              <Icon className="h-4 w-4 text-primary mb-2 opacity-70" />
              <div className="text-xs font-bold text-foreground mb-1">{label}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border px-8 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Motion Scanner v3.0 · SOC 2-aligned · Powered by GPT-5
        </p>
      </footer>
    </div>
  );
}

// ── Auth pages ────────────────────────────────────────────────────────────────

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

// ── Home: landing for signed-out, dashboard for signed-in ────────────────────

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Dashboard />
        </Layout>
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

// ── Cache invalidation on user change ────────────────────────────────────────

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ── App routes ────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Switch>
      {/* Public auth routes — must be exact pattern */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      {/* Home: landing or dashboard */}
      <Route path="/" component={HomeRedirect} />

      {/* All other routes require auth */}
      <Route>
        <>
          <Show when="signed-in">
            <Layout>
              <Switch>
                <Route path="/scanner" component={Scanner} />
                <Route path="/sector" component={SectorRotation} />
                <Route path="/watchlists" component={Watchlists} />
                <Route path="/broker" component={Broker} />
                <Route path="/history" component={History} />
                <Route path="/audit" component={AuditLogs} />
                <Route path="/settings" component={Settings} />
                <Route path="/notes" component={Notes} />
                <Route path="/news" component={News} />
                <Route path="/charts" component={Charts} />
                <Route path="/agent" component={Agent} />
                <Route path="/amf" component={Amf} />
                <Route component={NotFound} />
              </Switch>
            </Layout>
          </Show>
          <Show when="signed-out">
            <Redirect to="/sign-in" />
          </Show>
        </>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to Motion Scanner",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start scanning the market",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
