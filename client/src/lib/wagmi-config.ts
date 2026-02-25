import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon } from 'wagmi/chains';

// WalletConnect projectId - get one free at https://cloud.walletconnect.com
// For now, we use a placeholder that works for development with injected wallets (MetaMask)
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'development-mode';

export const wagmiConfig = getDefaultConfig({
  appName: 'Arbitrage Calculator',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [polygon],
  ssr: false,
});
