import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';

export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    onClick={openConnectModal}
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] text-xs sm:text-sm whitespace-nowrap"
                    data-testid="button-connect-wallet"
                  >
                    <Wallet className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button
                    onClick={openChainModal}
                    variant="destructive"
                    size="sm"
                    className="min-h-[44px]"
                    data-testid="button-wrong-network"
                  >
                    Wrong network
                  </Button>
                );
              }

              return (
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    onClick={openChainModal}
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1 sm:gap-2 min-h-[44px]"
                    data-testid="button-chain-selector"
                  >
                    {chain.hasIcon && (
                      <div
                        className="w-4 h-4 rounded-full overflow-hidden shrink-0"
                        style={{ background: chain.iconBackground }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            className="w-4 h-4"
                          />
                        )}
                      </div>
                    )}
                    <span className="hidden sm:inline">{chain.name}</span>
                  </Button>

                  <Button
                    onClick={openAccountModal}
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] text-xs sm:text-sm"
                    data-testid="button-account"
                  >
                    {account.displayName}
                    <span className="hidden sm:inline">{account.displayBalance ? ` (${account.displayBalance})` : ''}</span>
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
