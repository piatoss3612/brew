import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

loadEnvFiles();

const includeSecret = process.argv.includes('--with-secret');
const proxyUrl = readEnv('OG_COMPUTE_PROXY_URL') ?? proxyUrlFromServiceUrl() ?? '<OG_COMPUTE_PROXY_URL>';
const model = readEnv('OG_COMPUTE_MODEL') ?? '<OG_COMPUTE_MODEL>';
const appSecret = includeSecret
  ? readEnv('OG_COMPUTE_APP_SECRET') ?? '<OG_COMPUTE_APP_SECRET>'
  : '<OG_COMPUTE_APP_SECRET>';

console.log(buildCodeNode({ proxyUrl, model, appSecret }));

function buildCodeNode({ proxyUrl, model, appSecret }) {
  return `// Brew 0G release-review node.
// Paste this into a KeeperHub Code node after ReadTrust.
// Replace template variable node names if your workflow uses different labels.
const trust = {{ReadTrust.result}};
const attestationUid = {{Trigger.attestationUid}};

const proxyUrl = ${JSON.stringify(proxyUrl)};
const model = ${JSON.stringify(model)};
const appSecret = ${JSON.stringify(appSecret)};

const reviewContext = {
  trustId: trust?.trustId ?? trust?.id ?? null,
  beneficiary: trust?.beneficiary ?? null,
  templateId: trust?.templateId ?? null,
  token: trust?.token ?? null,
  amount: trust?.amount ?? null,
  deadline: trust?.deadline ?? null,
  released: trust?.released ?? false,
  refunded: trust?.refunded ?? false,
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
    max_tokens: 256,
  }),
});

const responseText = await response.text();
if (!response.ok) {
  return {
    mode: 'live',
    provider: '0g-compute',
    decision: 'blocked',
    rationale: [\`0G Compute returned HTTP \${response.status}\`],
    riskFlags: [responseText.slice(0, 500)],
    nextAction: 'do_not_release',
    receiptSummary: '0G release review failed before verifier execution.',
    responseId: null,
    responseKey: null,
  };
}

let body;
try {
  body = JSON.parse(responseText);
} catch (error) {
  return {
    mode: 'live',
    provider: '0g-compute',
    decision: 'blocked',
    rationale: ['0G Compute response was not JSON.'],
    riskFlags: [String(error?.message ?? error)],
    nextAction: 'do_not_release',
    receiptSummary: '0G release review returned an unparsable response.',
    responseId: null,
    responseKey: null,
  };
}

const rawContent = body?.choices?.[0]?.message?.content ?? '';
const cleanedContent = String(rawContent)
  .trim()
  .replace(/^\\\`\\\`\\\`(?:json)?/i, '')
  .replace(/\\\`\\\`\\\`$/i, '')
  .trim();

let review;
try {
  review = JSON.parse(cleanedContent);
} catch (error) {
  return {
    mode: 'live',
    provider: '0g-compute',
    decision: 'blocked',
    rationale: ['0G Compute did not return strict JSON review content.'],
    riskFlags: [String(error?.message ?? error), rawContent.slice(0, 500)],
    nextAction: 'do_not_release',
    receiptSummary: '0G release review could not be parsed into the Brew review schema.',
    responseId: body?.id ?? null,
    responseKey: response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key'),
  };
}

return {
  mode: 'live',
  provider: '0g-compute',
  agentName: 'Trust Operations Agent',
  decision: review.decision ?? 'blocked',
  rationale: Array.isArray(review.rationale) ? review.rationale : [],
  riskFlags: Array.isArray(review.riskFlags) ? review.riskFlags : [],
  nextAction: review.nextAction ?? 'do_not_release',
  receiptSummary: review.receiptSummary ?? '0G Compute produced a Brew release review.',
  responseId: body?.id ?? null,
  responseKey: response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key'),
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
