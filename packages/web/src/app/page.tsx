import Link from 'next/link';

import { ConnectWalletButton } from './connect-wallet-button';
import { OverviewToast } from './overview-toast';
import { TrustDirectory } from './trust-directory';
import { TrustWorkflow } from './trust-workflow';

type HomeProps = {
  searchParams?: Promise<{
    trustCreated?: string | string[];
    tx?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = searchParams ? await searchParams : undefined;
  const trustCreated = firstParam(params?.trustCreated) === '1';
  const tx = firstParam(params?.tx);

  return (
    <main className="app-shell">
      <OverviewToast created={trustCreated} tx={tx} />

      <header className="top-bar">
        <div className="brand-lockup">
          <h1>Brew</h1>
          <p>Trust release workspace</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-link" href="/sponsor/new">
            New trust
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <TrustWorkflow />
      <TrustDirectory />
    </main>
  );
}
