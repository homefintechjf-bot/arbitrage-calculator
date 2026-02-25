import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { BrowserProvider, type Signer } from 'ethers';
import { polymarketClient, type WalletBalance, type UserPosition } from '@/lib/polymarket-trading';
import { useToast } from '@/hooks/use-toast';

interface PolymarketContextValue {
  isConnected: boolean;
  isOnPolygon: boolean;
  isLoading: boolean;
  balance: WalletBalance | null;
  positions: UserPosition[];
  error: string | null;
  switchToPolygon: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const PolymarketContext = createContext<PolymarketContextValue | null>(null);

export function PolymarketProvider({ children }: { children: ReactNode }) {
  const { isConnected, chainId, address } = useAccount();
  const { data: walletClient, isSuccess: walletClientReady } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef<Signer | null>(null);
  const isConnectingRef = useRef(false);
  const prevChainIdRef = useRef<number | undefined>(undefined);

  const isOnPolygon = chainId === polygon.id;

  const switchToPolygon = useCallback(async () => {
    try {
      await switchChain({ chainId: polygon.id });
    } catch (err) {
      toast({
        title: 'Network switch failed',
        description: 'Please switch to Polygon network manually in your wallet',
        variant: 'destructive',
      });
    }
  }, [switchChain, toast]);

  const connectClient = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !isOnPolygon) return false;
    if (isConnectingRef.current) return false;

    isConnectingRef.current = true;
    try {
      const provider = new BrowserProvider(walletClient as any);
      const signer = await provider.getSigner();
      signerRef.current = signer;
      await polymarketClient.connect(signer);
      return true;
    } catch (err) {
      console.error('Failed to connect Polymarket client:', err);
      return false;
    } finally {
      isConnectingRef.current = false;
    }
  }, [walletClient, isOnPolygon]);

  const refreshData = useCallback(async () => {
    if (!isConnected || !isOnPolygon || !walletClientReady) {
      setBalance(null);
      setPositions([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const connected = await connectClient();
      if (!connected) {
        return;
      }

      const [bal, pos] = await Promise.all([
        polymarketClient.getBalance(),
        polymarketClient.getUserPositions(),
      ]);

      setBalance(bal);
      setPositions(pos);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMsg);
      toast({
        title: 'Data fetch failed',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, isOnPolygon, walletClientReady, connectClient, toast]);

  useEffect(() => {
    if (isConnected && isOnPolygon && walletClientReady) {
      refreshData();
    } else {
      setBalance(null);
      setPositions([]);
      setError(null);
    }
  }, [isConnected, isOnPolygon, walletClientReady, address, refreshData]);

  useEffect(() => {
    if (prevChainIdRef.current !== undefined && prevChainIdRef.current !== chainId && isOnPolygon) {
      refreshData();
    }
    prevChainIdRef.current = chainId;
  }, [chainId, isOnPolygon, refreshData]);

  const value: PolymarketContextValue = {
    isConnected,
    isOnPolygon,
    isLoading,
    balance,
    positions,
    error,
    switchToPolygon,
    refreshData,
  };

  return (
    <PolymarketContext.Provider value={value}>
      {children}
    </PolymarketContext.Provider>
  );
}

export function usePolymarket(): PolymarketContextValue {
  const context = useContext(PolymarketContext);
  if (!context) {
    throw new Error('usePolymarket must be used within a PolymarketProvider');
  }
  return context;
}
