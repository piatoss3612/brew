export async function fetchReviewReceiptArtifact(input: {
  rootHash?: string | null;
  uri?: string | null;
}) {
  const params = new URLSearchParams();

  if (input.rootHash) {
    params.set('rootHash', input.rootHash);
  } else if (input.uri) {
    params.set('uri', input.uri);
  } else {
    throw new Error('Review receipt root or URI is required');
  }

  const response = await fetch(`/api/review-receipt/storage?${params.toString()}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Review receipt request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as unknown;
}
