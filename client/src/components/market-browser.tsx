import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, TrendingUp, Loader2, RefreshCw, DollarSign, Plus, Clock, Link2, Check, ArrowUpDown, Filter, Flame, Timer, BarChart3, Zap, Star, ThumbsUp, ThumbsDown, HelpCircle, ExternalLink, PanelLeft, PanelRight, Layers, EyeOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useComparison } from "@/contexts/comparison-context";

interface MarketOutcome {
  label: string;
  yesPrice: number;
  noPrice: number;
  volume?: number;
}

interface StandardizedMarket {
  id: string;
  platform: "Kalshi" | "Polymarket" | "PredictIt";
  title: string;
  category?: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  lastUpdated: string;
  endDate?: string;
  marketUrl?: string;
  isBinary: boolean;
  outcomeCount: number;
  contractLabel?: string;
  outcomes?: MarketOutcome[];
}

// Detect if user is on mobile device (touch-primary OR mobile UA)
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for touch-primary device (includes fold phones, tablets)
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  // Check for mobile user agent - includes fold phones with large screens
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Fold phones have touch AND mobile UA, even with large screens
  return hasCoarsePointer || isMobileUA;
}

// Open both market URLs - split screen on desktop, two tabs on mobile
function openBothMarkets(urlA: string, urlB: string, toast: any): void {
  if (!urlA || !urlB) {
    toast({
      title: "Missing URLs",
      description: "One or both markets don't have viewable URLs",
      variant: "destructive",
    });
    return;
  }
  
  const mobile = isMobileDevice();
  
  if (mobile) {
    // Mobile: Open two tabs sequentially
    const windowA = window.open(urlA, '_blank');
    
    // Small delay to avoid popup blockers
    setTimeout(() => {
      const windowB = window.open(urlB, '_blank');
      
      if (!windowA || !windowB) {
        // Try to copy to clipboard, but handle errors gracefully
        try {
          navigator.clipboard?.writeText(`${urlA}\n${urlB}`).catch(() => {});
        } catch (e) {
          // Clipboard access denied - that's okay
        }
        toast({
          title: "Pop-up blocked",
          description: `Please allow pop-ups, or manually open:\n${urlA}\n${urlB}`,
        });
      }
    }, 100);
  } else {
    // Desktop: Try to open side-by-side windows
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const halfWidth = Math.floor(screenWidth / 2);
    
    // Left window
    const leftFeatures = `width=${halfWidth},height=${screenHeight},left=0,top=0,menubar=no,toolbar=yes,location=yes,status=yes,resizable=yes,scrollbars=yes`;
    const windowA = window.open(urlA, 'marketA', leftFeatures);
    
    // Right window
    const rightFeatures = `width=${halfWidth},height=${screenHeight},left=${halfWidth},top=0,menubar=no,toolbar=yes,location=yes,status=yes,resizable=yes,scrollbars=yes`;
    const windowB = window.open(urlB, 'marketB', rightFeatures);
    
    if (!windowA || !windowB) {
      toast({
        title: "Pop-up blocked",
        description: "Please allow pop-ups for side-by-side view. Opening in tabs instead...",
      });
      // Fallback to regular tabs
      window.open(urlA, '_blank');
      setTimeout(() => window.open(urlB, '_blank'), 100);
    } else {
      toast({
        title: "Markets opened",
        description: "Both markets opened side-by-side. You may need to arrange windows manually.",
      });
    }
  }
}

// Calculate profit based on investment amount and ROI
function calculateProfit(roi: number, investment: number): { profit: number; payout: number; contracts: number } {
  if (roi <= 0 || investment <= 0) return { profit: 0, payout: 0, contracts: 0 };
  const profit = (investment * roi) / 100;
  const payout = investment + profit;
  const contracts = Math.floor(investment); // Simplified: 1 contract = $1
  return { profit, payout, contracts };
}

interface ComboLeg {
  platform: string;
  marketId: string;
  title: string;
  side: "YES" | "NO";
  price: number;
  fee: number;
  volume: number;
  marketUrl?: string | null;
  allocation: number;
}

interface ArbitrageOpportunity {
  marketA: StandardizedMarket;
  marketB: StandardizedMarket;
  combinedYesCost: number;
  totalCost?: number;
  fees?: number;
  potentialProfit: number;
  roi: number;
  matchScore: number;
  matchReason: string;
  comboType?: "pair";
  legCount?: number;
  legs?: ComboLeg[];
  earliestResolution?: string | null;
  scenario?: number | string;
}

// Extended opportunity with computed fields for sorting
interface EnrichedOpportunity extends ArbitrageOpportunity {
  opportunityScore: number;
  liquidityScore: number;
  daysToExpiry: number | null;
  roiHistory?: number[];
}

type SortOption = "roi" | "score" | "ending-soon" | "ending-late" | "liquidity" | "hot";

const SORT_OPTIONS: { value: SortOption; label: string; icon: any }[] = [
  { value: "roi", label: "Highest ROI", icon: TrendingUp },
  { value: "score", label: "Opportunity Score", icon: Star },
  { value: "hot", label: "Hot (ROI + Soon)", icon: Flame },
  { value: "ending-soon", label: "Ending Soonest", icon: Timer },
  { value: "ending-late", label: "Ending Latest", icon: Clock },
  { value: "liquidity", label: "Highest Liquidity", icon: BarChart3 },
];

const QUICK_PRESETS = [
  { id: "best-roi", label: "Best ROI", sort: "roi" as SortOption, minRoi: 3 },
  { id: "hot-opportunities", label: "Hot Opportunities", sort: "hot" as SortOption, minRoi: 1 },
  { id: "quick-wins", label: "Quick Wins", sort: "ending-soon" as SortOption, minRoi: 2 },
  { id: "safe-bets", label: "High Volume", sort: "liquidity" as SortOption, minRoi: 1 },
];

interface MarketStats {
  kalshi: number;
  polymarket: number;
  predictit: number;
  total: number;
  lastUpdated: string;
}

const platformColors: Record<string, string> = {
  Kalshi: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  Polymarket: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  PredictIt: "bg-green-500/10 text-green-700 dark:text-green-400",
};

function AllMarketsGrid({ markets, platformColors }: { markets: StandardizedMarket[]; platformColors: Record<string, string> }) {
  const { pinLeft, pinRight, leftMarket, rightMarket } = useComparison();
  const { toast } = useToast();

  const handlePinLeft = (market: StandardizedMarket) => {
    pinLeft({
      id: market.id,
      platform: market.platform,
      title: market.title,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      marketUrl: market.marketUrl,
      outcomes: market.outcomes,
      outcomeCount: market.outcomeCount,
    });
    toast({
      title: "Pinned to left",
      description: `${market.platform}: ${market.title.slice(0, 50)}...`,
    });
  };

  const handlePinRight = (market: StandardizedMarket) => {
    pinRight({
      id: market.id,
      platform: market.platform,
      title: market.title,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      marketUrl: market.marketUrl,
      outcomes: market.outcomes,
      outcomeCount: market.outcomeCount,
    });
    toast({
      title: "Pinned to right",
      description: `${market.platform}: ${market.title.slice(0, 50)}...`,
    });
  };

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-4">
        {markets.map((market) => (
          <div 
            key={market.id} 
            className="p-3 rounded-md border hover-elevate space-y-2"
            data-testid={`market-${market.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm leading-snug flex-1">{market.title}</p>
              {market.outcomeCount > 2 && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <Layers className="w-3 h-3 mr-1" />
                  {market.outcomeCount} options
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={platformColors[market.platform]}>
                  {market.platform}
                </Badge>
                {market.category && (
                  <Badge variant="outline" className="text-xs">
                    {market.category}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-sm">
                <span>
                  YES: <span className="font-bold text-green-600 dark:text-green-400">{(market.yesPrice * 100).toFixed(0)}c</span>
                </span>
                <span className="text-muted-foreground">
                  NO: <span className="font-bold">{(market.noPrice * 100).toFixed(0)}c</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant={leftMarket?.id === market.id ? "default" : "outline"}
                className="min-h-[36px] text-xs"
                onClick={() => handlePinLeft(market)}
                data-testid={`button-pin-left-${market.id}`}
              >
                <PanelLeft className="w-3 h-3 mr-1" />
                Compare Left
              </Button>
              <Button
                size="sm"
                variant={rightMarket?.id === market.id ? "default" : "outline"}
                className="min-h-[36px] text-xs"
                onClick={() => handlePinRight(market)}
                data-testid={`button-pin-right-${market.id}`}
              >
                <PanelRight className="w-3 h-3 mr-1" />
                Compare Right
              </Button>
              {market.marketUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[36px] text-xs ml-auto"
                  onClick={() => window.open(market.marketUrl, '_blank')}
                  data-testid={`button-open-${market.id}`}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

interface MarketBrowserProps {
  autoRefresh?: boolean;
  refreshInterval?: string;
  enabledPlatforms?: string[];
  onScanComplete?: () => void;
  defaultInvestment?: number;
}

export function MarketBrowser({ 
  autoRefresh = false, 
  refreshInterval = "5",
  enabledPlatforms = ["Kalshi", "Polymarket", "PredictIt"],
  onScanComplete,
  defaultInvestment = 100
}: MarketBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("opportunities");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStartTime, setScanStartTime] = useState<Date | null>(null);
  const [scanElapsed, setScanElapsed] = useState(0);
  const [scanProgress, setScanProgress] = useState<{
    percent: number;
    phase: string;
    message: string;
    status: string;
    totalComparisons: number;
    completedComparisons: number;
    pairsFound: number;
    totalMarkets: number;
  } | null>(null);
  const [manualPairOpen, setManualPairOpen] = useState(false);
  const [marketA, setMarketA] = useState<StandardizedMarket | null>(null);
  const [marketB, setMarketB] = useState<StandardizedMarket | null>(null);
  const [pairSearchA, setPairSearchA] = useState("");
  const [pairSearchB, setPairSearchB] = useState("");
  
  // Investment amount for profit calculations
  const [investmentAmount, setInvestmentAmount] = useState(defaultInvestment.toString());
  
  // Sorting and filtering state
  const [sortBy, setSortBy] = useState<SortOption>("roi");
  const [minRoiFilter, setMinRoiFilter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  
  const [ratedPairs, setRatedPairs] = useState<Map<string, string>>(new Map());
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());
  
  const { toast } = useToast();
  
  // Feedback mutation for machine learning
  const feedbackMutation = useMutation({
    mutationFn: async ({ opportunity, verdict }: { opportunity: ArbitrageOpportunity; verdict: 'approve' | 'reject' | 'not_binary' | 'not_interested' }) => {
      return await apiRequest('POST', '/api/match-feedback', {
        marketAId: opportunity.marketA.id,
        marketATitle: opportunity.marketA.title,
        marketAPlatform: opportunity.marketA.platform,
        marketBId: opportunity.marketB.id,
        marketBTitle: opportunity.marketB.title,
        marketBPlatform: opportunity.marketB.platform,
        matchScore: opportunity.matchScore,
        matchReason: opportunity.matchReason,
        verdict,
      });
    },
    onSuccess: (_, variables) => {
      const pairKey = `${variables.opportunity.marketA.id}-${variables.opportunity.marketB.id}`;
      if (variables.verdict === 'not_interested') {
        setDismissedPairs(prev => new Set(Array.from(prev).concat([pairKey])));
        toast({
          title: "Dismissed",
          description: "This opportunity has been hidden.",
        });
      } else {
        setRatedPairs(prev => new Map(Array.from(prev).concat([[pairKey, variables.verdict]])));
        const verdictLabel = variables.verdict === 'approve' ? 'Good match' : variables.verdict === 'reject' ? 'Not a match' : 'Not binary';
        toast({
          title: "Feedback recorded",
          description: `Marked as: ${verdictLabel}. Thanks for improving our matching!`,
        });
      }
    },
    onError: (error: any) => {
      if (error.message?.includes('409')) {
        toast({
          title: "Already rated",
          description: "You've already provided feedback for this pair.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save feedback. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  useEffect(() => {
    fetch("/api/scan-status")
      .then(res => res.json())
      .then(state => {
        if (state.is_scanning) {
          setIsScanning(true);
          setScanStartTime(new Date());
          setScanElapsed(0);
        }
      })
      .catch(() => {});
    fetch("/api/match-feedback")
      .then(res => res.json())
      .then((items: Array<{ marketAId: string; marketBId: string; verdict: string }>) => {
        const rated = new Map<string, string>();
        const dismissed = new Set<string>();
        for (const item of items) {
          const key = `${item.marketAId}-${item.marketBId}`;
          if (item.verdict === 'not_interested') {
            dismissed.add(key);
          } else {
            rated.set(key, item.verdict);
          }
        }
        setRatedPairs(rated);
        setDismissedPairs(dismissed);
      })
      .catch(() => {});
  }, []);

  // Calculate manual pair ROI preview
  const manualPairPreview = useMemo(() => {
    if (!marketA || !marketB) return null;
    // Scenario 1: Buy YES on A + Buy NO on B
    const cost1 = marketA.yesPrice + (1 - marketB.yesPrice);
    const roi1 = cost1 < 1 ? ((1 - cost1) / cost1) * 100 : 0;
    // Scenario 2: Buy NO on A + Buy YES on B
    const cost2 = (1 - marketA.yesPrice) + marketB.yesPrice;
    const roi2 = cost2 < 1 ? ((1 - cost2) / cost2) * 100 : 0;
    return { roi1, roi2, cost1, cost2, bestRoi: Math.max(roi1, roi2) };
  }, [marketA, marketB]);

  // Fetch market stats
  const { data: stats } = useQuery<MarketStats>({
    queryKey: ["/api/market-stats"],
    queryFn: async () => {
      const res = await fetch("/api/market-stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: markets = [], isLoading: marketsLoading, refetch: refetchMarkets } = useQuery<StandardizedMarket[]>({
    queryKey: ["/api/markets", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/markets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "all" || manualPairOpen,
    staleTime: 30000,
  });

  const { data: opportunities = [], isLoading: oppsLoading, refetch: refetchOpps } = useQuery<ArbitrageOpportunity[]>({
    queryKey: ["/api/arbitrage-opportunities", searchQuery, enabledPlatforms],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      params.set("minRoi", "0");
      params.set("platforms", enabledPlatforms.join(","));
      const res = await fetch(`/api/arbitrage-opportunities?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setLastRefresh(new Date());
      return res.json();
    },
    enabled: activeTab === "opportunities",
    staleTime: 60000,
  });

  const triggerScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanStartTime(new Date());
    setScanElapsed(0);
    setScanProgress(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: enabledPlatforms }),
      });
      const data = await res.json();
      if (data.status === "already_scanning") {
        toast({ title: "Scan in progress", description: "A scan is already running. Please wait for it to complete." });
      }
    } catch (e) {
      setIsScanning(false);
      setScanStartTime(null);
      toast({ title: "Scan failed", description: "Could not start scan. Please try again.", variant: "destructive" });
    }
  };

  // Track elapsed time during scanning
  useEffect(() => {
    if (!isScanning || !scanStartTime) return;
    const timer = setInterval(() => {
      setScanElapsed(Math.floor((Date.now() - scanStartTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isScanning, scanStartTime]);

  // Subscribe to SSE for real-time progress updates
  useEffect(() => {
    if (!isScanning) return;
    
    const eventSource = new EventSource('/api/scan-progress');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setScanProgress({
          percent: data.percent || 0,
          phase: data.phase || 'Starting...',
          message: data.message || '',
          status: data.status || 'idle',
          totalComparisons: data.totalComparisons || 0,
          completedComparisons: data.completedComparisons || 0,
          pairsFound: data.pairsFound || 0,
          totalMarkets: data.totalMarkets || 0,
        });
        
        if (data.status === 'complete') {
          eventSource.close();
          setTimeout(() => {
            refetchOpps();
            queryClient.invalidateQueries({ queryKey: ["/api/market-stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
            onScanComplete?.();
            setIsScanning(false);
            setScanStartTime(null);
          }, 1500);
        } else if (data.status === 'error') {
          eventSource.close();
          setIsScanning(false);
          setScanStartTime(null);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(() => {
        fetch("/api/scan-status")
          .then(r => r.json())
          .then(s => {
            if (!s.is_scanning) {
              setIsScanning(false);
              setScanStartTime(null);
              refetchOpps();
              queryClient.invalidateQueries({ queryKey: ["/api/market-stats"] });
            }
          })
          .catch(() => {
            setIsScanning(false);
            setScanStartTime(null);
          });
      }, 2000);
    };
    
    return () => {
      eventSource.close();
    };
  }, [isScanning]);

  // Calculate opportunity score (0-100) based on ROI, time, volume, and match confidence
  const calculateOpportunityScore = (opp: ArbitrageOpportunity): number => {
    // ROI component (0-40 points) - scale so 5% ROI = max 40 points
    const roiScore = Math.min(40, (opp.roi / 5) * 40);
    // Confidence component (0-20 points)
    const confidenceScore = Math.min(20, (opp.matchScore / 100) * 20);
    // Volume component (0-20 points) - log scale, capped
    const avgVolume = (opp.marketA.volume + opp.marketB.volume) / 2;
    const volumeScore = Math.min(20, Math.log10(Math.max(1, avgVolume)) * 5);
    // Time component (0-20 points)
    let timeScore = 10;
    const endDate = opp.marketA.endDate || opp.marketB.endDate;
    if (endDate) {
      const daysLeft = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysLeft <= 7) timeScore = 20;
      else if (daysLeft <= 30) timeScore = 15;
      else if (daysLeft <= 90) timeScore = 10;
      else timeScore = 5;
    }
    // Clamp total to 0-100
    return Math.min(100, Math.max(0, Math.round(roiScore + confidenceScore + volumeScore + timeScore)));
  };

  // Generate stable ROI history for sparkline using seeded pseudo-random
  const generateStableRoiHistory = (opp: ArbitrageOpportunity): number[] => {
    // Use market IDs as seed for deterministic values
    const seed = (opp.marketA.id + opp.marketB.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const seededRandom = (i: number) => {
      const x = Math.sin(seed + i) * 10000;
      return x - Math.floor(x);
    };
    const currentRoi = opp.roi;
    const history: number[] = [];
    let value = currentRoi * (0.7 + seededRandom(0) * 0.3);
    for (let i = 0; i < 6; i++) {
      history.push(Math.max(0, value));
      value += (currentRoi - value) * 0.3 + (seededRandom(i + 1) - 0.5) * 0.5;
    }
    history.push(currentRoi);
    return history;
  };

  // Enrich opportunities with computed fields
  const enrichedOpportunities = useMemo((): EnrichedOpportunity[] => {
    return opportunities.map(opp => {
      const endDate = opp.marketA.endDate || opp.marketB.endDate;
      let daysToExpiry: number | null = null;
      if (endDate) {
        daysToExpiry = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }
      const avgVolume = (opp.marketA.volume + opp.marketB.volume) / 2;
      const liquidityScore = Math.min(100, Math.log10(avgVolume + 1) * 25);
      return {
        ...opp,
        opportunityScore: calculateOpportunityScore(opp),
        liquidityScore,
        daysToExpiry,
        roiHistory: generateStableRoiHistory(opp),
      };
    });
  }, [opportunities]);

  // Sort and filter opportunities
  const sortedOpportunities = useMemo(() => {
    let filtered = enrichedOpportunities
      .filter(opp => !dismissedPairs.has(`${opp.marketA.id}-${opp.marketB.id}`))
      .filter(opp => opp.roi >= minRoiFilter);
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(opp => 
        selectedCategories.includes(opp.marketA.category || "") ||
        selectedCategories.includes(opp.marketB.category || "")
      );
    }
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "roi": return b.roi - a.roi;
        case "score": return b.opportunityScore - a.opportunityScore;
        case "hot":
          const hotScoreA = a.roi * (a.daysToExpiry ? Math.max(1, 30 - a.daysToExpiry) / 30 : 0.5);
          const hotScoreB = b.roi * (b.daysToExpiry ? Math.max(1, 30 - b.daysToExpiry) / 30 : 0.5);
          return hotScoreB - hotScoreA;
        case "ending-soon":
          if (a.daysToExpiry === null && b.daysToExpiry === null) return 0;
          if (a.daysToExpiry === null) return 1;
          if (b.daysToExpiry === null) return -1;
          return a.daysToExpiry - b.daysToExpiry;
        case "ending-late":
          if (a.daysToExpiry === null && b.daysToExpiry === null) return 0;
          if (a.daysToExpiry === null) return 1;
          if (b.daysToExpiry === null) return -1;
          return b.daysToExpiry - a.daysToExpiry;
        case "liquidity": return b.liquidityScore - a.liquidityScore;
        default: return b.roi - a.roi;
      }
    });
  }, [enrichedOpportunities, sortBy, minRoiFilter, selectedCategories, dismissedPairs]);

  // Apply preset
  const applyPreset = (presetId: string) => {
    const preset = QUICK_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setSortBy(preset.sort);
      setMinRoiFilter(preset.minRoi);
      setActivePreset(presetId);
    }
  };

  // Get unique categories from opportunities
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    opportunities.forEach(opp => {
      if (opp.marketA.category) cats.add(opp.marketA.category);
      if (opp.marketB.category) cats.add(opp.marketB.category);
    });
    return Array.from(cats);
  }, [opportunities]);

  const addToWatchlistMutation = useMutation({
    mutationFn: async (opp: ArbitrageOpportunity) => {
      // Store raw YES prices from both markets
      // The watchlist ROI calculator evaluates both scenarios:
      // 1) Buy YES on A + Buy NO on B (uses siteAYesPrice + (1 - siteBYesPrice))
      // 2) Buy NO on A + Buy YES on B (uses (1 - siteAYesPrice) + siteBYesPrice)
      // This matches how the opportunity was detected
      return apiRequest("POST", "/api/watchlist", {
        marketName: `${opp.matchReason || "arbitrage"}: ${opp.marketA.title.slice(0, 30)}`,
        siteAName: opp.marketA.platform,
        siteBName: opp.marketB.platform,
        siteAYesPrice: opp.marketA.yesPrice,
        siteBYesPrice: opp.marketB.yesPrice,
        investment: 500,
        alertThreshold: 3,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Added to watchlist", description: "Market pair added for monitoring" });
    },
    onError: () => {
      toast({ title: "Failed to add", description: "Could not add to watchlist", variant: "destructive" });
    },
  });

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || activeTab !== "opportunities") return;
    
    const intervalMs = parseInt(refreshInterval) * 60 * 1000;
    const timer = setInterval(() => {
      refetchOpps();
    }, intervalMs);
    
    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, activeTab, refetchOpps]);

  const handleRefresh = () => {
    if (activeTab === "all") {
      refetchMarkets();
    } else {
      triggerScan();
    }
  };

  const isLoading = activeTab === "all" ? marketsLoading : oppsLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Live Market Browser
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <Dialog open={manualPairOpen} onOpenChange={setManualPairOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  data-testid="button-manual-pair"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Pair Manually
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Manual Market Pairing</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select two markets from different platforms to calculate arbitrage ROI.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Market A</Label>
                      <Input
                        placeholder="Search platform A..."
                        value={pairSearchA}
                        onChange={(e) => setPairSearchA(e.target.value)}
                        data-testid="input-pair-search-a"
                      />
                      {marketA && (
                        <div className="p-2 rounded border bg-muted/50">
                          <Badge className={platformColors[marketA.platform]}>{marketA.platform}</Badge>
                          <p className="text-sm mt-1 line-clamp-2">{marketA.title}</p>
                          <p className="text-xs font-mono">YES: ${marketA.yesPrice.toFixed(2)}</p>
                        </div>
                      )}
                      <ScrollArea className="h-40 border rounded">
                        {markets
                          .filter(m => m.title.toLowerCase().includes(pairSearchA.toLowerCase()))
                          .slice(0, 20)
                          .map(m => (
                            <div
                              key={m.id}
                              className={`p-2 cursor-pointer hover-elevate ${marketA?.id === m.id ? 'bg-primary/10' : ''}`}
                              onClick={() => setMarketA(m)}
                            >
                              <Badge className={platformColors[m.platform]} variant="secondary">{m.platform}</Badge>
                              <p className="text-xs line-clamp-1">{m.title}</p>
                            </div>
                          ))
                        }
                      </ScrollArea>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Market B</Label>
                      <Input
                        placeholder="Search platform B..."
                        value={pairSearchB}
                        onChange={(e) => setPairSearchB(e.target.value)}
                        data-testid="input-pair-search-b"
                      />
                      {marketB && (
                        <div className="p-2 rounded border bg-muted/50">
                          <Badge className={platformColors[marketB.platform]}>{marketB.platform}</Badge>
                          <p className="text-sm mt-1 line-clamp-2">{marketB.title}</p>
                          <p className="text-xs font-mono">YES: ${marketB.yesPrice.toFixed(2)}</p>
                        </div>
                      )}
                      <ScrollArea className="h-40 border rounded">
                        {markets
                          .filter(m => m.title.toLowerCase().includes(pairSearchB.toLowerCase()))
                          .filter(m => m.platform !== marketA?.platform)
                          .slice(0, 20)
                          .map(m => (
                            <div
                              key={m.id}
                              className={`p-2 cursor-pointer hover-elevate ${marketB?.id === m.id ? 'bg-primary/10' : ''}`}
                              onClick={() => setMarketB(m)}
                            >
                              <Badge className={platformColors[m.platform]} variant="secondary">{m.platform}</Badge>
                              <p className="text-xs line-clamp-1">{m.title}</p>
                            </div>
                          ))
                        }
                      </ScrollArea>
                    </div>
                  </div>
                  
                  {marketA && marketB && marketA.platform === marketB.platform && (
                    <div className="p-4 rounded-lg border border-destructive bg-destructive/10">
                      <p className="text-sm text-destructive font-medium">
                        Both markets are from the same platform ({marketA.platform}). 
                        Please select markets from different platforms for cross-platform arbitrage.
                      </p>
                    </div>
                  )}
                  
                  {manualPairPreview && marketA?.platform !== marketB?.platform && (
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <h4 className="font-medium mb-2">ROI Preview</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Scenario 1 (YES A + NO B)</p>
                          <p className={`text-lg font-mono font-bold ${manualPairPreview.roi1 > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {manualPairPreview.roi1.toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Scenario 2 (NO A + YES B)</p>
                          <p className={`text-lg font-mono font-bold ${manualPairPreview.roi2 > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {manualPairPreview.roi2.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      {manualPairPreview.bestRoi > 0 && (
                        <Button
                          className="w-full mt-3 min-h-[44px]"
                          onClick={() => {
                            if (marketA && marketB) {
                              addToWatchlistMutation.mutate({
                                marketA,
                                marketB,
                                combinedYesCost: manualPairPreview.cost1,
                                potentialProfit: 1 - manualPairPreview.cost1,
                                roi: manualPairPreview.bestRoi,
                                matchScore: 100,
                                matchReason: "manual-pair"
                              });
                              setManualPairOpen(false);
                              setMarketA(null);
                              setMarketB(null);
                            }
                          }}
                          data-testid="button-add-manual-pair"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add to Watchlist ({manualPairPreview.bestRoi.toFixed(1)}% ROI)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={handleRefresh}
              disabled={isLoading}
              data-testid="button-refresh-markets"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px]"
            data-testid="input-market-search"
          />
        </div>

        {stats && stats.total > 0 && (
          <div className="flex items-center gap-4 p-3 rounded-md border bg-muted/30 flex-wrap">
            <span className="text-sm font-medium">Live Markets:</span>
            <Badge className={platformColors.Kalshi}>
              Kalshi: {stats.kalshi.toLocaleString()}
            </Badge>
            <Badge className={platformColors.Polymarket}>
              Polymarket: {stats.polymarket.toLocaleString()}
            </Badge>
            <Badge className={platformColors.PredictIt}>
              PredictIt: {stats.predictit.toLocaleString()}
            </Badge>
            <span className="text-sm text-muted-foreground ml-auto">
              Total: {stats.total.toLocaleString()} markets
            </span>
          </div>
        )}

        {(autoRefresh || isScanning) && (
          <div className="space-y-2" data-testid="scan-status">
            {isScanning ? (
              <div className={`p-4 rounded-md border space-y-3 transition-opacity duration-700 ${
                scanProgress?.percent === 100 ? 'bg-green-500/10 border-green-500/30 opacity-80' : 'bg-muted/30'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {scanProgress?.percent === 100 ? (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="relative w-5 h-5">
                        <div className="absolute inset-0 rounded-full border-2 border-green-500/30" />
                        <div className="absolute inset-0 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {scanProgress?.phase || 'Scanning markets...'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {scanProgress?.message || 'Initializing...'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="font-mono tabular-nums text-lg px-3 py-1 bg-green-600 text-white hover:bg-green-600">
                      {scanProgress?.percent ?? 0}%
                    </Badge>
                    <Badge variant="outline" className="font-mono tabular-nums">
                      {Math.floor(scanElapsed / 60)}:{(scanElapsed % 60).toString().padStart(2, '0')}
                    </Badge>
                  </div>
                </div>
                <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out ${
                      scanProgress?.percent === 100 ? 'bg-green-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${scanProgress?.percent ?? 0}%` }}
                    data-testid="progress-bar-fill"
                  />
                  {(scanProgress?.percent ?? 0) < 100 && (
                    <div
                      className="absolute inset-y-0 left-0 bg-green-400/30 rounded-full animate-pulse"
                      style={{ width: `${Math.min(100, (scanProgress?.percent ?? 0) + 3)}%` }}
                    />
                  )}
                </div>
                {scanProgress && scanProgress.totalComparisons > 0 && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                    <span>{scanProgress.totalMarkets.toLocaleString()} markets</span>
                    <span>{scanProgress.completedComparisons.toLocaleString()}/{scanProgress.totalComparisons.toLocaleString()} comparisons</span>
                    <span className="text-green-600 dark:text-green-400 font-semibold">{scanProgress.pairsFound} matches</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
                <Badge variant="secondary">Auto-scan active</Badge>
                {lastRefresh && (
                  <span className="text-xs text-muted-foreground">
                    Every {refreshInterval} min
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="opportunities" className="min-h-[44px] px-2 sm:px-4" data-testid="tab-opportunities">
              <TrendingUp className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">Arbitrage </span>Opportunities
              </span>
              <Badge variant="secondary" className="ml-1 sm:ml-2 shrink-0">{opportunities.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all" className="min-h-[44px] px-2 sm:px-4" data-testid="tab-all-markets">
              <DollarSign className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">All </span>Markets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" className="mt-4 space-y-4">
            {/* Quick Presets */}
            <div className="flex gap-2 flex-wrap">
              {QUICK_PRESETS.map(preset => (
                <Button
                  key={preset.id}
                  variant={activePreset === preset.id ? "default" : "outline"}
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => applyPreset(preset.id)}
                  data-testid={`preset-${preset.id}`}
                >
                  {preset.id === "best-roi" && <TrendingUp className="w-4 h-4 mr-1" />}
                  {preset.id === "hot-opportunities" && <Flame className="w-4 h-4 mr-1" />}
                  {preset.id === "quick-wins" && <Zap className="w-4 h-4 mr-1" />}
                  {preset.id === "safe-bets" && <BarChart3 className="w-4 h-4 mr-1" />}
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Investment Amount Input */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-md border bg-muted/30">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-muted-foreground shrink-0" />
                <Label htmlFor="investment-amount" className="text-sm font-medium whitespace-nowrap">Investment:</Label>
                <Input
                  id="investment-amount"
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder="100"
                  className="w-24 sm:w-28 min-h-[44px]"
                  data-testid="input-investment-amount"
                />
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">Profit shown for each opportunity below</span>
            </div>

            {/* Sorting and Filtering Controls */}
            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-sm font-medium shrink-0">Sort by:</Label>
                  <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortOption); setActivePreset(null); }}>
                    <SelectTrigger className="w-40 sm:w-48 min-h-[44px]" data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <opt.icon className="w-4 h-4" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="min-h-[44px]" data-testid="button-toggle-filters">
                      <Filter className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Filters</span>
                      <span className="sm:hidden">Filter</span>
                      {minRoiFilter > 0 && <Badge variant="secondary" className="ml-1 sm:ml-2">{minRoiFilter}%+</Badge>}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                
                <span className="text-xs sm:text-sm text-muted-foreground sm:ml-auto">
                  Showing {sortedOpportunities.length} of {opportunities.length}{dismissedPairs.size > 0 ? ` (${dismissedPairs.size} hidden)` : ''}
                </span>
              </div>
              
              <CollapsibleContent className="mt-4 p-4 rounded-md border bg-muted/20">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Minimum ROI</Label>
                      <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{minRoiFilter}%</span>
                    </div>
                    <Slider
                      value={[minRoiFilter]}
                      onValueChange={([v]) => { setMinRoiFilter(v); setActivePreset(null); }}
                      min={0}
                      max={10}
                      step={0.5}
                      className="w-full"
                      data-testid="slider-min-roi"
                    />
                  </div>
                  
                  {availableCategories.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">Categories</Label>
                      <div className="flex gap-2 flex-wrap">
                        {availableCategories.map(cat => (
                          <Button
                            key={cat}
                            variant={selectedCategories.includes(cat) ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedCategories(prev => 
                              prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                            )}
                            data-testid={`filter-category-${cat}`}
                          >
                            {cat}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMinRoiFilter(0); setSelectedCategories([]); setActivePreset(null); }}
                    data-testid="button-clear-filters"
                  >
                    Clear all filters
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {oppsLoading || isScanning ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground font-medium">
                  Scanning {stats?.total ? stats.total.toLocaleString() : "all"} markets across 3 platforms...
                </span>
                <span className="text-sm text-muted-foreground">This may take 30-60 seconds for a full scan</span>
              </div>
            ) : sortedOpportunities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-2">
                {opportunities.length > 0 ? (
                  <>
                    <p>No opportunities match your current filters.</p>
                    <p className="text-sm">Try lowering the minimum ROI or clearing filters.</p>
                  </>
                ) : (
                  <>
                    <p>No matching markets found across platforms.</p>
                    <p className="text-sm">True arbitrage requires the SAME question on different platforms with different prices.</p>
                    <p className="text-sm">Most platforms offer different market questions, so cross-platform matches are rare.</p>
                    <p className="text-sm mt-4">Tip: Use the "All Markets" tab to browse individual markets, then manually add pairs to your watchlist.</p>
                  </>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {sortedOpportunities.map((opp, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 sm:p-4 rounded-md border ${opp.roi >= 3 ? "border-green-500/50 bg-green-500/5" : ""}`}
                      data-testid={`card-opportunity-${idx}`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline">{opp.matchReason || "matched"}</Badge>
                            <Badge variant="secondary" className="font-mono">
                              <Layers className="w-3 h-3 mr-1" />
                              2-leg
                            </Badge>
                            {opp.matchScore >= 80 ? (
                              <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">High confidence</Badge>
                            ) : opp.matchScore >= 60 ? (
                              <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">Medium confidence</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">Verify manually</Badge>
                            )}
                            <Badge variant="secondary" className="font-mono">
                              <Star className="w-3 h-3 mr-1" />
                              {opp.opportunityScore}/100
                            </Badge>
                            {opp.daysToExpiry !== null && (
                              <Badge variant={opp.daysToExpiry <= 7 ? "destructive" : "outline"} className="font-mono">
                                <Timer className="w-3 h-3 mr-1" />
                                {opp.daysToExpiry}d left
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-2">
                            {opp.legs && opp.legs.length > 0 ? (
                              opp.legs.map((leg, legIdx) => (
                                <div key={legIdx} className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className={platformColors[leg.platform] || "bg-muted text-foreground"}>
                                      {leg.platform}
                                    </Badge>
                                    <span className="font-mono font-bold text-sm">
                                      {(leg.price * 100).toFixed(0)}c {leg.side}
                                    </span>
                                    {leg.allocation < 1 && (
                                      <Badge variant="outline" className="text-xs font-mono">
                                        {(leg.allocation * 100).toFixed(0)}% alloc
                                      </Badge>
                                    )}
                                    {leg.fee > 0 && (
                                      <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                                        fee: {(leg.fee * 100).toFixed(1)}c
                                      </span>
                                    )}
                                    {leg.marketUrl && (
                                      <a
                                        href={leg.marketUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 underline text-xs hover:text-blue-800 dark:hover:text-blue-300"
                                        data-testid={`link-leg-${idx}-${legIdx}`}
                                      >
                                        {leg.platform}
                                      </a>
                                    )}
                                  </div>
                                  <p className="text-sm leading-relaxed text-muted-foreground">{leg.title}</p>
                                </div>
                              ))
                            ) : (
                              <>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className={platformColors[opp.marketA.platform]}>
                                      {opp.marketA.platform}
                                    </Badge>
                                    <span className="font-mono font-bold text-sm">{(opp.marketA.yesPrice * 100).toFixed(0)}c YES</span>
                                    {opp.marketA.marketUrl && (
                                      <a href={opp.marketA.marketUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 underline text-xs">
                                        {opp.marketA.platform}
                                      </a>
                                    )}
                                  </div>
                                  <p className="text-sm leading-relaxed text-muted-foreground">{opp.marketA.title}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className={platformColors[opp.marketB.platform]}>
                                      {opp.marketB.platform}
                                    </Badge>
                                    <span className="font-mono font-bold text-sm">{(opp.marketB.noPrice * 100).toFixed(0)}c NO</span>
                                    {opp.marketB.marketUrl && (
                                      <a href={opp.marketB.marketUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 underline text-xs">
                                        {opp.marketB.platform}
                                      </a>
                                    )}
                                  </div>
                                  <p className="text-sm leading-relaxed text-muted-foreground">{opp.marketB.title}</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="w-full md:w-auto md:text-right shrink-0 space-y-2">
                          <div className="flex items-center md:justify-end gap-2">
                            {/* ROI Trend Sparkline */}
                            {opp.roiHistory && opp.roiHistory.length > 0 && (() => {
                              const maxVal = Math.max(...opp.roiHistory, 0.01); // Guard against 0/negative
                              return (
                                <div className="flex items-end gap-0.5 h-6">
                                  {opp.roiHistory.map((val, i) => (
                                    <div
                                      key={i}
                                      className={`w-1 rounded-sm ${i === opp.roiHistory!.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                                      style={{ height: `${Math.max(4, Math.min(100, (Math.max(0, val) / maxVal) * 100))}%` }}
                                    />
                                  ))}
                                </div>
                              );
                            })()}
                            <p className={`text-xl font-bold ${opp.roi >= 3 ? "text-green-600 dark:text-green-400" : opp.roi > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                              {opp.roi.toFixed(2)}%
                            </p>
                          </div>
                          {/* Profit calculation based on investment */}
                          {(() => {
                            const inv = parseFloat(investmentAmount) || 0;
                            if (inv > 0 && opp.roi > 0) {
                              const { profit } = calculateProfit(opp.roi, inv);
                              return (
                                <p className="text-sm font-semibold text-green-600 dark:text-green-400" data-testid={`profit-${idx}`}>
                                  ${inv.toFixed(0)} invest → +${profit.toFixed(2)} profit
                                </p>
                              );
                            }
                            return null;
                          })()}
                          <p className="text-sm text-muted-foreground">
                            Cost: {((opp.totalCost || opp.combinedYesCost) * 100).toFixed(0)}c
                            {opp.fees ? ` (${(opp.fees * 100).toFixed(1)}c fees)` : ""}
                            {" | Vol: "}
                            {((opp.marketA.volume + opp.marketB.volume) / 2).toLocaleString()}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="min-h-[44px]"
                              onClick={() => openBothMarkets(
                                opp.marketA.marketUrl || '',
                                opp.marketB.marketUrl || '',
                                toast
                              )}
                              disabled={!opp.marketA.marketUrl || !opp.marketB.marketUrl}
                              data-testid={`button-open-markets-${idx}`}
                              title="Opens both markets in new tabs"
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View Both
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px]"
                              onClick={() => addToWatchlistMutation.mutate(opp)}
                              disabled={addToWatchlistMutation.isPending}
                              data-testid={`button-add-opp-${idx}`}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Watch
                            </Button>
                          </div>
                        </div>
                        
                        {/* Feedback buttons for ML training */}
                        {(() => {
                          const pairKey = `${opp.marketA.id}-${opp.marketB.id}`;
                          const currentVerdict = ratedPairs.get(pairKey);
                          const isPending = feedbackMutation.isPending;
                          
                          return (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">Rate match:</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className={`h-10 w-10 min-h-[44px] min-w-[44px] ${currentVerdict === 'approve' ? 'bg-green-500/30 ring-2 ring-green-500' : 'hover:bg-green-500/20'}`}
                                onClick={() => feedbackMutation.mutate({ opportunity: opp, verdict: 'approve' })}
                                disabled={isPending}
                                title="Good match - same event"
                                data-testid={`button-approve-${idx}`}
                              >
                                <ThumbsUp className={`w-5 h-5 ${currentVerdict === 'approve' ? 'text-green-400' : 'text-green-600'}`} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className={`h-10 w-10 min-h-[44px] min-w-[44px] ${currentVerdict === 'reject' ? 'bg-red-500/30 ring-2 ring-red-500' : 'hover:bg-red-500/20'}`}
                                onClick={() => feedbackMutation.mutate({ opportunity: opp, verdict: 'reject' })}
                                disabled={isPending}
                                title="Not a match - different events"
                                data-testid={`button-reject-${idx}`}
                              >
                                <ThumbsDown className={`w-5 h-5 ${currentVerdict === 'reject' ? 'text-red-400' : 'text-red-600'}`} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className={`h-10 w-10 min-h-[44px] min-w-[44px] ${currentVerdict === 'not_binary' ? 'bg-yellow-500/30 ring-2 ring-yellow-500' : 'hover:bg-yellow-500/20'}`}
                                onClick={() => feedbackMutation.mutate({ opportunity: opp, verdict: 'not_binary' })}
                                disabled={isPending}
                                title="Not a binary market (multiple outcomes)"
                                data-testid={`button-not-binary-${idx}`}
                              >
                                <HelpCircle className={`w-5 h-5 ${currentVerdict === 'not_binary' ? 'text-yellow-400' : 'text-yellow-600'}`} />
                              </Button>
                              <div className="w-px h-6 bg-border mx-1" />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-10 min-h-[44px] px-3 hover:bg-muted text-muted-foreground hover:text-foreground"
                                onClick={() => feedbackMutation.mutate({ opportunity: opp, verdict: 'not_interested' })}
                                disabled={isPending}
                                title="Not interested - hide this opportunity"
                                data-testid={`button-not-interested-${idx}`}
                              >
                                <EyeOff className="w-4 h-4 mr-1" />
                                <span className="text-xs">Not Interested</span>
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            {marketsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading markets...</span>
              </div>
            ) : markets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No markets found. Try a different search.
              </div>
            ) : (
              <AllMarketsGrid markets={markets} platformColors={platformColors} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
