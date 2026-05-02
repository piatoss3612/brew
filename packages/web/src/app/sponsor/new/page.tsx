import Link from 'next/link';

import { ConnectWalletButton } from '../../connect-wallet-button';
import { SponsorNewForm } from './sponsor-new-form';

export default function NewSponsorTrustPage() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <h1>Brew</h1>
          <p>Create a funded trust</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-link" href="/app">
            Overview
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <SponsorNewForm />
    </main>
  );
}
