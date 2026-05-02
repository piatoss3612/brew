export const MAX_IPFS_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_IPFS_GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs/';

const CID_PATTERN = /^(?:ipfs:\/\/)?([a-zA-Z0-9]+)(\/.*)?$/;

export function sanitizeEvidenceFileName(value) {
  const sanitized = String(value ?? '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'brew-evidence';
}

export function buildIpfsGatewayUrl(uriOrCid, gatewayBase = DEFAULT_IPFS_GATEWAY_URL) {
  const match = String(uriOrCid ?? '').trim().match(CID_PATTERN);
  if (!match) return '';

  const cid = match[1];
  const path = match[2] ?? '';
  const base = String(gatewayBase || DEFAULT_IPFS_GATEWAY_URL).replace(/\/+$/, '');
  return `${base}/${cid}${path}`;
}

export function readPinataCid(value) {
  if (!value || typeof value !== 'object') return undefined;

  if (typeof value.IpfsHash === 'string') return value.IpfsHash;
  if (typeof value.cid === 'string') return value.cid;

  const data = value.data;
  if (data && typeof data === 'object') {
    if (typeof data.cid === 'string') return data.cid;
    if (typeof data.IpfsHash === 'string') return data.IpfsHash;
  }

  return undefined;
}

export function buildEvidenceFieldPatch(fields, upload) {
  const patch = {};
  const uri = upload?.uri;
  const bytes32Hash = upload?.bytes32Hash;

  if (!uri || !bytes32Hash) return patch;

  let hasUriField = false;

  for (const field of fields) {
    const name = String(field?.name ?? '');
    const lowerName = name.toLowerCase();
    const type = String(field?.type ?? '');

    if (type === 'string' && (lowerName.endsWith('_uri') || lowerName.endsWith('uri'))) {
      patch[name] = uri;
      hasUriField = true;
    }

    if (type === 'bytes32' && (lowerName.endsWith('_hash') || lowerName.endsWith('hash'))) {
      patch[name] = bytes32Hash;
    }
  }

  if (!hasUriField) {
    const verificationSource = fields.find(
      (field) => field?.type === 'string' && field?.name === 'verification_source',
    );
    if (verificationSource) patch.verification_source = uri;
  }

  return patch;
}
