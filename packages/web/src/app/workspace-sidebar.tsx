import Link from 'next/link';

import { BrewMark } from './brew-mark';

type WorkspaceSidebarProps = {
  active: 'overview' | 'workspace' | 'workflows' | 'new-trust' | 'trust-detail';
  detailHref?: string;
  detailLabel?: string;
  statusLabel: string;
  statusValue: string;
};

function sidebarClass(active: WorkspaceSidebarProps['active'], id: WorkspaceSidebarProps['active']) {
  return active === id ? 'sidebar-link sidebar-link-active' : 'sidebar-link';
}

export function WorkspaceSidebar({
  active,
  detailHref,
  detailLabel,
  statusLabel,
  statusValue,
}: WorkspaceSidebarProps) {
  return (
    <aside className="workspace-sidebar" aria-label="Brew workspace navigation">
      <Link className="sidebar-brand" href="/app">
        <span className="brand-mark" aria-hidden="true">
          <BrewMark />
        </span>
        <strong>Brew</strong>
      </Link>
      <nav>
        <Link className={sidebarClass(active, 'overview')} href="/app">
          Overview
        </Link>
        <Link className={sidebarClass(active, 'workspace')} href="/workspace">
          Your workspace
        </Link>
        <Link className={sidebarClass(active, 'workflows')} href="/workflows">
          Workflows
        </Link>
        <Link className={sidebarClass(active, 'new-trust')} href="/sponsor/new">
          New trust
        </Link>
        {detailHref && detailLabel ? (
          <Link className={sidebarClass(active, 'trust-detail')} href={detailHref}>
            {detailLabel}
          </Link>
        ) : null}
      </nav>
      <div className="sidebar-status">
        <span className="data-label">{statusLabel}</span>
        <strong>{statusValue}</strong>
      </div>
    </aside>
  );
}
