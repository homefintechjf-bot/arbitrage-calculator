import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { WalletConnectButton } from './wallet-connect-button';
import { usePolymarket } from '@/contexts/polymarket-context';
import { useToast } from '@/hooks/use-toast';
import { openMarketsInSplitScreen } from '@/lib/split-screen';
import { ExternalLink, TrendingUp, TrendingDown, AlertCircle, Loader2, Wallet, AlertTriangle } from 'lucide-react';
// Note: Loader2 still used for balance loading state

interface TradingPanelProps {
  marketA: {
    title: string;
    platform: string;
    yesPrice: number;
    noPrice: number;
    url: string;
    tokenId?: string;
  };
  marketB: {
    title: string;
    platform: string;
    yesPrice: number;
    noPrice: number;
    url: string;
    tokenId?: string;
  };
  roi: number;
  onClose?: () => void;
}

export function TradingPanel({ marketA, marketB, roi, onClose }: TradingPanelProps) {
  const { isConnected, isOnPolygon, isLoading, balance, error, switchToPolygon } = usePolymarket();
  const { toast } = useToast();
  const [amount, setAmount] = useState('10');

  const amountNum = parseFloat(amount) || 0;
  const totalCost = amountNum * (marketA.yesPrice + marketB.noPrice);
  const potentialProfit = amountNum - totalCost;

  const handleOpenMarkets = () => {
    if (!marketA.url || !marketB.url) {
      toast({
        title: "Missing market links",
        description: "One or both markets don't have valid URLs",
        variant: "destructive"
      });
      return;
    }

    // CRITICAL: Must be synchronous from click - no async before window.open
    const result = openMarketsInSplitScreen(marketA.url, marketB.url);
    
    if (result.method === 'clipboard') {
      toast({
        title: "Popup blocked",
        description: result.message || "URLs copied to clipboard",
        variant: "destructive"
      });
    } else if (result.method === 'split') {
      toast({
        title: "Markets opened",
        description: "Both markets opened side-by-side"
      });
    } else {
      toast({
        title: "Markets opened", 
        description: "Both markets opened in new tabs"
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">Execute Arbitrage</CardTitle>
          <Badge variant={roi >= 5 ? "default" : roi >= 3 ? "secondary" : "outline"}>
            {roi.toFixed(2)}% ROI
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <div className="text-center py-4 space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Connect your wallet to see your balance
            </p>
            <WalletConnectButton />
          </div>
        ) : !isOnPolygon ? (
          <div className="text-center py-4 space-y-3">
            <AlertTriangle className="w-8 h-8 mx-auto text-yellow-500" />
            <p className="text-sm text-muted-foreground">
              Switch to Polygon network to see your balance
            </p>
            <Button onClick={switchToPolygon} data-testid="button-switch-polygon">
              Switch to Polygon
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Balance:</span>
              </div>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : error ? (
                <span className="text-sm text-destructive">Failed to load</span>
              ) : balance ? (
                <span className="text-sm font-mono">
                  ${balance.usdc.toFixed(2)} USDC
                </span>
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Buy YES</span>
                </div>
                <div className="p-2 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground truncate">{marketA.title}</p>
                  <p className="text-sm font-medium">{marketA.platform}</p>
                  <p className="text-lg font-mono">${marketA.yesPrice.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium">Buy NO</span>
                </div>
                <div className="p-2 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground truncate">{marketB.title}</p>
                  <p className="text-sm font-medium">{marketB.platform}</p>
                  <p className="text-lg font-mono">${marketB.noPrice.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (shares)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="1"
                data-testid="input-trade-amount"
              />
            </div>

            <div className="p-3 bg-muted rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span>Total Cost:</span>
                <span className="font-mono">${totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Guaranteed Return:</span>
                <span className="font-mono">${amountNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-green-600 dark:text-green-400">
                <span>Profit:</span>
                <span className="font-mono">+${potentialProfit.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleOpenMarkets}
                disabled={amountNum <= 0}
                data-testid="button-open-markets"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Both Markets
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Opens both platforms so you can place your orders
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
