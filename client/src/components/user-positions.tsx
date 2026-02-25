import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePolymarket } from '@/contexts/polymarket-context';
import { Loader2, Wallet, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

export function UserPositions() {
  const { isConnected, isOnPolygon, isLoading, balance, positions, error, switchToPolygon, refreshData } = usePolymarket();

  if (!isConnected) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Your Positions
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            onClick={refreshData}
            disabled={isLoading || !isOnPolygon}
            data-testid="button-refresh-positions"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOnPolygon ? (
          <div className="text-center py-6 space-y-3">
            <AlertTriangle className="w-8 h-8 mx-auto text-yellow-500" />
            <p className="text-sm text-muted-foreground">
              Switch to Polygon network to view your positions
            </p>
            <Button onClick={switchToPolygon} size="sm" data-testid="button-switch-polygon-positions">
              Switch to Polygon
            </Button>
          </div>
        ) : isLoading && !balance ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <AlertTriangle className="w-8 h-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-destructive">Failed to load data</p>
            <Button variant="outline" size="sm" onClick={refreshData} className="mt-2">
              Retry
            </Button>
          </div>
        ) : (
          <>
            {balance && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <span className="text-sm text-muted-foreground">USDC Balance</span>
                <span className="text-lg font-mono font-medium">
                  ${balance.usdc.toFixed(2)}
                </span>
              </div>
            )}

            {positions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No open positions</p>
                <p className="text-xs mt-1">Your Polymarket positions will appear here</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {positions.map((position, index) => (
                    <div
                      key={`${position.tokenId}-${index}`}
                      className="p-3 bg-muted/50 rounded-md space-y-2"
                      data-testid={`position-item-${index}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {position.marketTitle}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {position.outcome}
                            </Badge>
                            {position.outcome.toLowerCase() === 'yes' ? (
                              <TrendingUp className="w-3 h-3 text-green-500" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-red-500" />
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Size</span>
                        <span className="font-mono">{position.size.toFixed(2)} shares</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Avg Price</span>
                        <span className="font-mono">${position.avgPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Value</span>
                        <span className="font-mono font-medium">
                          ${(position.size * position.avgPrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
