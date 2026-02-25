import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface MarketOutcome {
  label: string;
  yesPrice: number;
  noPrice: number;
  volume?: number;
}

interface ComparisonMarket {
  id: string;
  platform: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  marketUrl?: string;
  outcomes?: MarketOutcome[];
  outcomeCount: number;
}

interface ComparisonContextValue {
  leftMarket: ComparisonMarket | null;
  rightMarket: ComparisonMarket | null;
  isComparing: boolean;
  pinLeft: (market: ComparisonMarket) => void;
  pinRight: (market: ComparisonMarket) => void;
  unpinLeft: () => void;
  unpinRight: () => void;
  clearComparison: () => void;
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [leftMarket, setLeftMarket] = useState<ComparisonMarket | null>(null);
  const [rightMarket, setRightMarket] = useState<ComparisonMarket | null>(null);

  const pinLeft = useCallback((market: ComparisonMarket) => {
    setLeftMarket(market);
  }, []);

  const pinRight = useCallback((market: ComparisonMarket) => {
    setRightMarket(market);
  }, []);

  const unpinLeft = useCallback(() => {
    setLeftMarket(null);
  }, []);

  const unpinRight = useCallback(() => {
    setRightMarket(null);
  }, []);

  const clearComparison = useCallback(() => {
    setLeftMarket(null);
    setRightMarket(null);
  }, []);

  const isComparing = leftMarket !== null || rightMarket !== null;

  return (
    <ComparisonContext.Provider value={{
      leftMarket,
      rightMarket,
      isComparing,
      pinLeft,
      pinRight,
      unpinLeft,
      unpinRight,
      clearComparison,
    }}>
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const context = useContext(ComparisonContext);
  if (!context) {
    throw new Error('useComparison must be used within a ComparisonProvider');
  }
  return context;
}
