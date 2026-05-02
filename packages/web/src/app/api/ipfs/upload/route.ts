import { createHash } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import {
  buildIpfsGatewayUrl,
  MAX_IPFS_EVIDENCE_FILE_BYTES,
  readPinataCid,
  sanitizeEvidenceFileName,
} from '../../../../ipfs-evidence.mjs';

export const runtime = 'nodejs';

const PINATA_PIN_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_UPLOAD_FILE_URL = 'https://uploads.pinata.cloud/v3/files';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) return jsonError('PINATA_JWT is not configured', 503);

  const formData = await request.formData().catch(() => null);
  const formFile = formData?.get('file');
  if (!formFile || typeof formFile === 'string') return jsonError('file is required', 400);

  const file = formFile as File;
  if (file.size <= 0) return jsonError('file is empty', 400);
  if (file.size > MAX_IPFS_EVIDENCE_FILE_BYTES) {
    return jsonError('file exceeds the 25MB evidence upload limit', 413);
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes32Hash = `0x${createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex')}`;
  const fileName = sanitizeEvidenceFileName(file.name);
  const mimeType = file.type || 'application/octet-stream';

  const uploadResult = await uploadToPinata({
    pinataJwt,
    arrayBuffer,
    fileName,
    mimeType,
    bytes32Hash,
  });
  if ('error' in uploadResult) return jsonError(uploadResult.error, uploadResult.status);

  const cid = uploadResult.cid;
  const uri = `ipfs://${cid}`;
  return NextResponse.json({
    cid,
    uri,
    gatewayUrl: buildIpfsGatewayUrl(uri, process.env.NEXT_PUBLIC_IPFS_GATEWAY),
    bytes32Hash,
    hashAlgorithm: 'sha256',
    fileName,
    mimeType,
    size: file.size,
  });
}

type PinataUploadInput = {
  pinataJwt: string;
  arrayBuffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
  bytes32Hash: string;
};
type PinataUploadResult =
  | {
      cid: string;
    }
  | {
      status: number;
      error: string;
    };
type PinataPostResult =
  | {
      status: number;
      cid: string;
    }
  | {
      status: number;
      error: string;
    };

async function uploadToPinata(input: PinataUploadInput): Promise<PinataUploadResult> {
  const v3Form = new FormData();
  v3Form.append('network', 'public');
  v3Form.append('file', new File([input.arrayBuffer], input.fileName, { type: input.mimeType }));
  v3Form.append('name', input.fileName);
  v3Form.append(
    'keyvalues',
    JSON.stringify({
      source: 'brew-attestation',
      sha256: input.bytes32Hash,
    }),
  );

  const v3 = await postPinataForm(PINATA_UPLOAD_FILE_URL, input.pinataJwt, v3Form);
  if ('cid' in v3) return { cid: v3.cid };

  const legacyForm = new FormData();
  legacyForm.append('file', new File([input.arrayBuffer], input.fileName, { type: input.mimeType }));
  legacyForm.append(
    'pinataMetadata',
    JSON.stringify({
      name: input.fileName,
      keyvalues: {
        source: 'brew-attestation',
        sha256: input.bytes32Hash,
      },
    }),
  );
  legacyForm.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const legacy = await postPinataForm(PINATA_PIN_FILE_URL, input.pinataJwt, legacyForm);
  if ('cid' in legacy) return { cid: legacy.cid };

  return {
    status: legacy.status || v3.status || 502,
    error: `Pinata upload failed. v3: ${v3.error}; legacy: ${legacy.error}`,
  };
}

async function postPinataForm(
  url: string,
  pinataJwt: string,
  form: FormData,
): Promise<PinataPostResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pinataJwt}`,
    },
    body: form,
  });
  const raw = await response.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : raw;
    return {
      status: response.status,
      error: detail || `HTTP ${response.status}`,
    };
  }

  const cid = readPinataCid(body);
  return cid
    ? { status: response.status, cid }
    : { status: 502, error: 'response did not include an IPFS CID' };
}
