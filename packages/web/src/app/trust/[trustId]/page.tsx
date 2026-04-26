import Link from 'next/link';

import { ConnectWalletButton } from '../../connect-wallet-button';
import { TrustDetail } from './trust-detail';

type TrustPageProps = {
  params: Promise<{
    trustId: string;
  }>;
};

export default async function TrustPage({ params }: TrustPageProps) {
  const { trustId } = await params;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <h1>Brew</h1>
          <p>Trust #{trustId}</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-link" href="/">
            Overview
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <TrustDetail trustId={trustId} />
    </main>
  );
}
