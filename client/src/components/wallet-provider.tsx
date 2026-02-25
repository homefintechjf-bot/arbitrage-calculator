import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi-config';
import '@rainbow-me/rainbowkit/styles.css';

interface WalletProviderProps {
  children: React.ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={{
          lightMode: lightTheme({
            accentColor: 'hsl(142, 76%, 36%)',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          }),
          darkMode: darkTheme({
            accentColor: 'hsl(142, 76%, 36%)',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          }),
        }}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
