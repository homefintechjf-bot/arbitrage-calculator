import { useComparison } from '@/contexts/comparison-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ExternalLink, ArrowLeftRight, TrendingUp, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OutcomeBarProps {
  label: string;
  percentage: number;
  isHighlighted?: boolean;
}

function OutcomeBar({ label, percentage, isHighlighted }: OutcomeBarProps) {
  const displayPercent = Math.round(percentage * 100);
  const barColor = isHighlighted 
    ? 'bg-gradient-to-r from-green-500 to-emerald-400' 
    : 'bg-gradient-to-r from-primary/60 to-primary/40';
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate flex-1 font-medium">{label}</span>
        <span className="font-mono font-bold ml-2">{displayPercent}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${displayPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

interface MarketPanelProps {
  market: {
    id: string;
    platform: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    marketUrl?: string;
    outcomes?: { label: string; yesPrice: number; noPrice: number }[];
    outcomeCount: number;
  };
  side: 'left' | 'right';
  onClose: () => void;
}

function MarketPanel({ market, side, onClose }: MarketPanelProps) {
  const platformColors: Record<string, string> = {
    Kalshi: 'from-blue-500 to-blue-600',
    Polymarket: 'from-purple-500 to-purple-600',
    PredictIt: 'from-green-500 to-green-600',
  };

  const gradientClass = platformColors[market.platform] || 'from-gray-500 to-gray-600';
  const hasOutcomes = market.outcomes && market.outcomes.length > 0;
  
  const sortedOutcomes = hasOutcomes 
    ? [...market.outcomes!].sort((a, b) => b.yesPrice - a.yesPrice)
    : [{ label: 'Yes', yesPrice: market.yesPrice, noPrice: market.noPrice }];

  return (
    <motion.div
      initial={{ 
        opacity: 0, 
        scale: 0.8, 
        x: side === 'left' ? -50 : 50,
        y: 20 
      }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: 0, 
        y: 0 
      }}
      exit={{ 
        opacity: 0, 
        scale: 0.8, 
        x: side === 'left' ? -50 : 50,
        y: 20 
      }}
      transition={{ 
        type: 'spring', 
        stiffness: 300, 
        damping: 25 
      }}
      className="flex-1 min-w-0 bg-card rounded-2xl border-2 shadow-2xl overflow-hidden"
    >
      <div className={`bg-gradient-to-r ${gradientClass} p-3 text-white`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="font-bold">{market.platform}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={onClose}
            data-testid={`button-close-${side}-panel`}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-3 border-b">
        <p className="text-sm font-medium line-clamp-2">{market.title}</p>
        {market.outcomeCount > 2 && (
          <Badge variant="outline" className="mt-2 text-xs">
            {market.outcomeCount} possible outcomes
          </Badge>
        )}
      </div>
      
      <ScrollArea className="h-48">
        <div className="p-3 space-y-3">
          {sortedOutcomes.map((outcome, idx) => (
            <OutcomeBar
              key={idx}
              label={outcome.label}
              percentage={outcome.yesPrice}
              isHighlighted={idx === 0}
            />
          ))}
        </div>
      </ScrollArea>
      
      {market.marketUrl && (
        <div className="p-3 border-t bg-muted/30">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => window.open(market.marketUrl, '_blank')}
            data-testid={`button-open-${side}-market`}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open on {market.platform}
          </Button>
        </div>
      )}
    </motion.div>
  );
}

export function OutcomeComparisonDock() {
  const { leftMarket, rightMarket, isComparing, unpinLeft, unpinRight, clearComparison } = useComparison();

  if (!isComparing) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-4 left-4 right-4 z-50"
        data-testid="comparison-dock"
      >
        <div className="max-w-4xl mx-auto">
          <div className="bg-background rounded-3xl border-2 shadow-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
                <span className="font-bold">Compare Markets</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearComparison}
                data-testid="button-clear-comparison"
              >
                <X className="w-4 h-4 mr-1" />
                Close
              </Button>
            </div>
            
            <div className="flex gap-4">
              <AnimatePresence mode="popLayout">
                {leftMarket ? (
                  <MarketPanel
                    key={`left-${leftMarket.id}`}
                    market={leftMarket}
                    side="left"
                    onClose={unpinLeft}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 min-h-[200px] rounded-2xl border-2 border-dashed flex items-center justify-center text-muted-foreground"
                  >
                    <div className="text-center p-4">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Click "Compare Left" on any market</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="flex items-center">
                <div className="w-px h-full bg-border" />
              </div>
              
              <AnimatePresence mode="popLayout">
                {rightMarket ? (
                  <MarketPanel
                    key={`right-${rightMarket.id}`}
                    market={rightMarket}
                    side="right"
                    onClose={unpinRight}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 min-h-[200px] rounded-2xl border-2 border-dashed flex items-center justify-center text-muted-foreground"
                  >
                    <div className="text-center p-4">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Click "Compare Right" on any market</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
