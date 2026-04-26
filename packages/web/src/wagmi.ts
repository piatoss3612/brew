import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Brew',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'YOUR_PROJECT_ID',
  chains: [sepolia],
  wallets: [
    {
      groupName: 'Wallets',
      wallets: [metaMaskWallet],
    },
  ],
  ssr: true,
});
