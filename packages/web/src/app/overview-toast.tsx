'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { txExplorerUrl } from '../chain';

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function OverviewToast({ created, tx }: { created: boolean; tx?: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(created);

  useEffect(() => {
    if (!created) return;

    router.replace('/', { scroll: false });
  }, [created, router]);

  useEffect(() => {
    if (!visible) return;

    const timeout = window.setTimeout(() => setVisible(false), 4200);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <strong>Trust created</strong>
      {tx ? (
        <a href={txExplorerUrl(tx)} target="_blank" rel="noreferrer">
          {shortHash(tx)}
        </a>
      ) : null}
    </div>
  );
}
