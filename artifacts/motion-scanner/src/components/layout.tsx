import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  Activity,
  BarChart2,
  Briefcase,
  Settings,
  History,
  List,
  ShieldAlert,
  Newspaper,
  StickyNote,
  CandlestickChart,
  Bot,
  LogOut,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/scanner", label: "Stock Finder", icon: BarChart2 },
  { href: "/amf", label: "A.M.F.", icon: Layers },
  { href: "/charts", label: "Charts", icon: CandlestickChart },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/sector", label: "Sector Rotation", icon: BarChart2 },
  { href: "/watchlists", label: "Watchlists", icon: List },
  { href: "/broker", label: "Broker", icon: Briefcase },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/history", label: "History", icon: History },
  { href: "/audit", label: "Audit Logs", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
];

function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded || !user) return null;

  const initial =
    user.firstName?.[0] ??
    user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ??
    "U";

  const displayName =
    user.fullName ??
    user.firstName ??
    user.emailAddresses[0]?.emailAddress ??
    "User";

  const email = user.emailAddresses[0]?.emailAddress ?? "";

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2 group">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-border flex items-center justify-center text-xs font-bold text-primary shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate text-foreground">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">{email}</div>
        </div>
        <button
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          title="Sign out"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-mono text-sm">
      <nav className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Activity className="h-5 w-5 text-[hsl(var(--go-color))]" />
          <span className="font-bold tracking-tight">MOTION SCANNER</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <UserMenu />
      </nav>
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
