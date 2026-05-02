import '@rainbow-me/rainbowkit/styles.css';
import '../styles/globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Brew',
  description: 'Agentic escrow release runtime for conditional grants.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
