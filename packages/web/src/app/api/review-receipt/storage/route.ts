import { NextResponse, type NextRequest } from 'next/server';

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const STORAGE_URI_PATTERN = /^0g:\/\/storage\/0x[0-9a-fA-F]{64}$/;

export const dynamic = 'force-dynamic';

function receiptServiceConfig() {
  const url = process.env.BREW_REVIEW_RECEIPT_URL;
  const apiKey = process.env.BREW_REVIEW_RECEIPT_API_KEY;
  const missing: string[] = [];

  if (!url) missing.push('BREW_REVIEW_RECEIPT_URL');
  if (!apiKey) missing.push('BREW_REVIEW_RECEIPT_API_KEY');

  return { url, apiKey, missing };
}

function storageUrl(serviceUrl: string, input: { rootHash?: string; uri?: string }) {
  const url = new URL(serviceUrl);

  url.pathname = url.pathname.replace(/\/review-receipt\/?$/, '/storage');
  if (!url.pathname.endsWith('/storage')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/storage`;
  }
  url.search = '';

  if (input.rootHash) {
    url.searchParams.set('rootHash', input.rootHash);
  } else if (input.uri) {
    url.searchParams.set('uri', input.uri);
  }

  return url;
}

export async function GET(request: NextRequest) {
  const config = receiptServiceConfig();
  if (config.missing.length > 0 || !config.url || !config.apiKey) {
    return NextResponse.json({ configured: false, missing: config.missing }, { status: 503 });
  }

  const rootHash = request.nextUrl.searchParams.get('rootHash')?.trim();
  const uri = request.nextUrl.searchParams.get('uri')?.trim();

  if (!rootHash && !uri) {
    return NextResponse.json({ error: 'rootHash or uri is required' }, { status: 400 });
  }
  if (rootHash && !BYTES32_PATTERN.test(rootHash)) {
    return NextResponse.json({ error: 'rootHash must be bytes32' }, { status: 400 });
  }
  if (uri && !STORAGE_URI_PATTERN.test(uri)) {
    return NextResponse.json({ error: 'uri must be a 0G storage URI' }, { status: 400 });
  }

  const response = await fetch(storageUrl(config.url, { rootHash, uri }), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    cache: 'no-store',
  });
  const text = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      { error: `Receipt storage request failed: ${response.status}`, raw: text.slice(0, 400) },
      { status: response.status },
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ raw: text });
  }
}
