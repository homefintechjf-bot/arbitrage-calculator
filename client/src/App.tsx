import { Switch, Route } from "wouter";
import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ComparisonProvider } from "@/contexts/comparison-context";
import { OutcomeComparisonDock } from "@/components/outcome-comparison-dock";
import { NavHeader } from "@/components/nav-header";
import { WifiOff } from "lucide-react";
import NotFound from "@/pages/not-found";
import ArbitrageCalculator from "@/pages/arbitrage-calculator";
import HistoryPage from "@/pages/history";
import SentinelPage from "@/pages/sentinel";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ArbitrageCalculator} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/sentinel" component={SentinelPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div 
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium"
      data-testid="indicator-offline"
    >
      <WifiOff className="w-4 h-4" />
      Offline Mode
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ComparisonProvider>
        <TooltipProvider>
          <div className="min-h-screen bg-background pb-24">
            <NavHeader />
            <Router />
          </div>
          <OutcomeComparisonDock />
          <OfflineIndicator />
          <Toaster />
        </TooltipProvider>
      </ComparisonProvider>
    </QueryClientProvider>
  );
}

export default App;
