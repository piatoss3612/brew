import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

loadEnvFiles();

const includeSecret = process.argv.includes('--with-secret');
const proxyUrl = readEnv('OG_COMPUTE_PROXY_URL') ?? proxyUrlFromServiceUrl() ?? '<OG_COMPUTE_PROXY_URL>';
const model = readEnv('OG_COMPUTE_MODEL') ?? '<OG_COMPUTE_MODEL>';
const appSecret = includeSecret
  ? readEnv('OG_COMPUTE_APP_SECRET') ?? '<OG_COMPUTE_APP_SECRET>'
  : '<OG_COMPUTE_APP_SECRET>';
const reviewReceiptUrl =
  readEnv('BREW_REVIEW_RECEIPT_URL') ?? '<BREW_WEB_ORIGIN>/api/review-receipt';
const reviewReceiptApiKey = includeSecret
  ? readEnv('BREW_REVIEW_RECEIPT_API_KEY') ?? ''
  : '<BREW_REVIEW_RECEIPT_API_KEY>';

console.log(buildCodeNode({ proxyUrl, model, appSecret, reviewReceiptUrl, reviewReceiptApiKey }));

function buildCodeNode({ proxyUrl, model, appSecret, reviewReceiptUrl, reviewReceiptApiKey }) {
  return `// Brew 0G release-review + storage-backed signed receipt node.
// Paste this into a KeeperHub Code node after ReadTrust.
// Boundary:
// - KeeperHub owns the 0G review workflow step and execution log.
// - The Brew receipt endpoint uploads the review artifact to 0G Storage.
// - The coordinator private key stays on the Brew receipt endpoint.
// - The verifier contract, not the AI response, remains the release authority.
// Expected inputs:
// - Trigger.trustId
// - Trigger.attestationUid
// - ReadTrust.result or ReadTrust.result.result containing the BrewEscrow Trust object

const readTrust = {{ReadTrust.result}};
const triggerTrustId = {{Trigger.trustId}};
const triggerAttestationUid = {{Trigger.attestationUid}};

const proxyUrl = ${JSON.stringify(proxyUrl)};
const model = ${JSON.stringify(model)};
const appSecret = ${JSON.stringify(appSecret)};
const reviewReceiptUrl = ${JSON.stringify(reviewReceiptUrl)};
const reviewReceiptApiKey = ${JSON.stringify(reviewReceiptApiKey)};

function unwrapTrust(value) {
  if (value && typeof value === 'object' && value.result && typeof value.result === 'object') {
    return value.result;
  }
  return value ?? {};
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  }
  return '';
}

function blocked(summary, extra = {}) {
  return {
    mode: 'live',
    provider: '0g-compute',
    status: 'blocked',
    releaseReady: false,
    decision: 'blocked',
    rationale: [summary],
    riskFlags: ['workflow_blocked'],
    nextAction: 'do_not_release',
    receiptSummary: summary,
    ...extra,
  };
}

function cleanJsonContent(content) {
  return String(content ?? '')
    .trim()
    .replace(/^\\\`\\\`\\\`(?:json)?/i, '')
    .replace(/\\\`\\\`\\\`$/i, '')
    .trim();
}

const trust = unwrapTrust(readTrust);
const trustId = pickString(triggerTrustId, trust?.trustId, trust?.id);
const attestationUid = pickString(triggerAttestationUid);
const beneficiary = pickString(trust?.beneficiary);
const templateId = pickString(trust?.templateId);

if (!trustId || !attestationUid || !beneficiary || !templateId) {
  return blocked('KeeperHub input is missing trustId, attestationUid, beneficiary, or templateId.', {
    trustId,
    attestationUid,
    beneficiary,
    templateId,
  });
}

const reviewContext = {
  trustId,
  beneficiary,
  templateId,
  token: pickString(trust?.token),
  amount: pickString(trust?.amount),
  deadline: pickString(trust?.deadline),
  released: Boolean(trust?.released),
  refunded: Boolean(trust?.refunded),
  attestationUid,
};

const prompt = [
  'Review this Brew trust-release context for a verifier-gated release.',
  'The AI review is advisory only. It must not claim authority to move funds.',
  'Return strict JSON only with this shape:',
  JSON.stringify({
    decision: 'ready_for_verifier | missing_evidence | blocked',
    rationale: ['short reason'],
    riskFlags: ['short risk flag or none'],
    nextAction: 'trigger_keeperhub | wait_for_attestation | do_not_release',
    receiptSummary: 'one sentence summary for the evidence receipt',
  }),
  'Trust context:',
  JSON.stringify(reviewContext),
].join('\\n\\n');

const response = await fetch(proxyUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: \`Bearer \${appSecret}\`,
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are Brew Trust Operations Agent. Return strict JSON only. Do not include markdown.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: 512,
  }),
});

const responseText = await response.text();
const responseKey = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key');

if (!response.ok) {
  return blocked(\`0G Compute returned HTTP \${response.status}\`, {
    responseKey,
    error: responseText.slice(0, 1000),
  });
}

let body;
try {
  body = JSON.parse(responseText);
} catch (error) {
  return blocked('0G Compute response was not JSON.', {
    responseKey,
    error: String(error?.message ?? error),
    raw: responseText.slice(0, 1000),
  });
}

const responseId = body?.id ?? null;
const rawContent = body?.choices?.[0]?.message?.content ?? '';
let review;
try {
  review = JSON.parse(cleanJsonContent(rawContent));
} catch (error) {
  return blocked('0G Compute did not return strict JSON review content.', {
    responseId,
    responseKey,
    error: String(error?.message ?? error),
    rawContent: String(rawContent).slice(0, 1000),
  });
}

const releaseReady =
  review?.decision === 'ready_for_verifier' && review?.nextAction === 'trigger_keeperhub';

if (!releaseReady) {
  return {
    mode: 'live',
    provider: '0g-compute',
    agentName: 'Trust Operations Agent',
    status: 'reviewed',
    releaseReady: false,
    trustId,
    attestationUid,
    beneficiary,
    templateId,
    decision: review?.decision ?? 'blocked',
    rationale: Array.isArray(review?.rationale) ? review.rationale : [],
    riskFlags: Array.isArray(review?.riskFlags) ? review.riskFlags : [],
    nextAction: review?.nextAction ?? 'do_not_release',
    receiptSummary: review?.receiptSummary ?? '0G Compute did not recommend verifier release.',
    responseId,
    responseKey,
    rawContent,
  };
}

const receiptResponse = await fetch(reviewReceiptUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(reviewReceiptApiKey ? { Authorization: \`Bearer \${reviewReceiptApiKey}\` } : {}),
  },
  body: JSON.stringify({
    trustId,
    beneficiary,
    attestationUid,
    templateId,
    source: 'keeperhub-code-node',
    review: {
      mode: 'live',
      provider: '0g-compute',
      model,
      endpoint: proxyUrl,
      responseId,
      responseKey,
      decision: review.decision,
      rationale: Array.isArray(review.rationale) ? review.rationale : [],
      riskFlags: Array.isArray(review.riskFlags) ? review.riskFlags : [],
      nextAction: review.nextAction,
      receiptSummary: review.receiptSummary,
      rawContent,
    },
  }),
});

const receiptText = await receiptResponse.text();
let receiptBody;
try {
  receiptBody = receiptText ? JSON.parse(receiptText) : {};
} catch (error) {
  return blocked('Review receipt API response was not JSON.', {
    responseId,
    responseKey,
    error: String(error?.message ?? error),
    raw: receiptText.slice(0, 1000),
  });
}

if (!receiptResponse.ok || receiptBody?.configured === false || !receiptBody?.reviewReceipt || !receiptBody?.coordinatorSignature) {
  return blocked('Review receipt API did not return a signed receipt.', {
    responseId,
    responseKey,
    receiptStatus: receiptResponse.status,
    receiptBody,
  });
}

return {
  mode: 'live',
  provider: '0g-compute',
  agentName: 'Trust Operations Agent',
  status: 'ready',
  releaseReady: true,
  trustId,
  attestationUid,
  beneficiary,
  templateId,
  decision: review.decision,
  rationale: Array.isArray(review.rationale) ? review.rationale : [],
  riskFlags: Array.isArray(review.riskFlags) ? review.riskFlags : [],
  nextAction: review.nextAction,
  receiptSummary: review.receiptSummary ?? '0G Compute recommended verifier release.',
  responseId,
  responseKey,
  rawContent,
  reviewReceipt: receiptBody.reviewReceipt,
  coordinatorSignature: receiptBody.coordinatorSignature,
  receiptDigestInput: receiptBody.receiptDigestInput,
  receiptStorage: receiptBody.receiptStorage,
};`;
}

function loadEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const index = trimmed.indexOf('=');
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      const value = stripQuotes(trimmed.slice(index + 1).trim());
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readEnv(key) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function proxyUrlFromServiceUrl() {
  const serviceUrl = readEnv('OG_COMPUTE_SERVICE_URL');
  if (!serviceUrl) return undefined;
  if (serviceUrl.endsWith('/chat/completions')) return serviceUrl;
  return `${serviceUrl.replace(/\/+$/, '')}/v1/proxy/chat/completions`;
}
