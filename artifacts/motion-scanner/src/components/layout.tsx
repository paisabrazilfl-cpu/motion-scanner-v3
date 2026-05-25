import { Link, useLocation } from "wouter";
import { 
  Activity, 
  BarChart2, 
  Briefcase, 
  Settings, 
  History, 
  List, 
  ShieldAlert,
  Newspaper,
  StickyNote
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/scanner", label: "Scanner", icon: BarChart2 },
  { href: "/sector", label: "Sector Rotation", icon: BarChart2 },
  { href: "/watchlists", label: "Watchlists", icon: List },
  { href: "/broker", label: "Broker", icon: Briefcase },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/history", label: "History", icon: History },
  { href: "/audit", label: "Audit Logs", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                      isActive 
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}>
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
