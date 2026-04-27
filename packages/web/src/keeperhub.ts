import type {
  KeeperHubEvidenceApiResponse,
  KeeperHubTriggerApiResponse,
  KeeperHubTriggerPayload,
} from './sponsor-evidence';

export async function fetchKeeperHubEvidence(trustId: string) {
  const response = await fetch(`/api/keeperhub/execution?trustId=${encodeURIComponent(trustId)}`);

  if (!response.ok) {
    throw new Error(`KeeperHub evidence request failed: ${response.status}`);
  }

  return (await response.json()) as KeeperHubEvidenceApiResponse;
}

export async function triggerKeeperHubRelease(payload: KeeperHubTriggerPayload) {
  const response = await fetch('/api/keeperhub/trigger', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as KeeperHubTriggerApiResponse | { error?: string };

  if (!response.ok) {
    throw new Error('error' in result && result.error ? result.error : `KeeperHub trigger failed: ${response.status}`);
  }

  return result as KeeperHubTriggerApiResponse;
}
