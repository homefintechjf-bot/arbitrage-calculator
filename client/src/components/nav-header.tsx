import { Link, useLocation } from "wouter";
import { Calculator, Radar, History } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Calculator", icon: Calculator },
  { path: "/sentinel", label: "Sentinel", icon: Radar },
  { path: "/history", label: "History", icon: History },
];

export function NavHeader() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="container mx-auto px-2 sm:px-4 max-w-4xl">
        <div className="flex h-14 items-center justify-between gap-1 sm:gap-4">
          <div className="font-semibold text-sm sm:text-lg shrink-0">Arb<span className="hidden sm:inline"> Finder</span></div>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="gap-1 sm:gap-2 min-h-[44px] px-2 sm:px-3"
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
