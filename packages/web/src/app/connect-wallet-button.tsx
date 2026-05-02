'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function ConnectWalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button className="wallet-button" type="button" onClick={openConnectModal}>
              Connect wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button className="wallet-button wallet-button-warning" type="button" onClick={openChainModal}>
              Wrong network
            </button>
          );
        }

        return (
          <div className="wallet-button-group">
            <button className="wallet-button wallet-button-secondary" type="button" onClick={openChainModal}>
              {chain.name}
            </button>
            <button className="wallet-button" type="button" onClick={openAccountModal}>
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
