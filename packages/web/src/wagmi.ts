import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { BREW_CHAIN } from './chain';

export const config = createConfig({
  chains: [BREW_CHAIN],
  connectors: [injected({ target: 'metaMask' })],
  transports: {
    [BREW_CHAIN.id]: http(),
  },
  ssr: true,
});
