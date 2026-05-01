import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (isDirectRun()) {
  loadEnvFiles();

  const includeSecret = process.argv.includes('--with-secret');
  const proxyUrl =
    readEnv('OG_COMPUTE_PROXY_URL') ?? proxyUrlFromServiceUrl() ?? '<OG_COMPUTE_PROXY_URL>';
  const model = readEnv('OG_COMPUTE_MODEL') ?? '<OG_COMPUTE_MODEL>';
  const appSecret = includeSecret
    ? readEnv('OG_COMPUTE_APP_SECRET') ?? '<OG_COMPUTE_APP_SECRET>'
    : '<OG_COMPUTE_APP_SECRET>';
  const reviewReceiptUrl =
    readEnv('BREW_REVIEW_RECEIPT_URL') ?? '<BREW_RECEIPT_SERVICE_ORIGIN>/review-receipt';
  const reviewReceiptApiKey = includeSecret
    ? readEnv('BREW_REVIEW_RECEIPT_API_KEY') ?? ''
    : '<BREW_REVIEW_RECEIPT_API_KEY>';

  console.log(
    buildCodeNode({
      proxyUrl,
      model,
      appSecret,
      reviewReceiptUrl,
      reviewReceiptApiKey,
      agenticIds: agenticIdsFromEnv(),
    }),
  );
}

export function buildCodeNode({
  proxyUrl,
  model,
  appSecret,
  reviewReceiptUrl,
  reviewReceiptApiKey,
  agenticIds = agenticIdsFromEnv(),
}) {
  return `// Brew 0G review-swarm + storage-backed signed receipt node.
// Paste this into a KeeperHub Code node after ReadTrust.
// Boundary:
// - KeeperHub owns the 0G review workflow step and execution log.
// - 0G Compute runs Evidence, Policy, and Risk review agents.
// - The Brew receipt-service uploads the swarm bundle to 0G Storage.
// - The coordinator private key stays on the Brew receipt-service.
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
const agenticIds = ${JSON.stringify(agenticIds, null, 2)};

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

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function blocked(summary, extra = {}) {
  return {
    mode: 'live',
    provider: '0g-compute',
    agentName: 'Brew Review Swarm',
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

const reviewAgents = [
  {
    role: 'evidence',
    label: 'Evidence Agent',
    expectedDecision: 'approve',
    instruction:
      'Check whether the attestation identity, recipient, and trust fields are complete enough for verifier release. Return approve, missing_evidence, or reject.',
  },
  {
    role: 'policy',
    label: 'Policy Agent',
    expectedDecision: 'approve',
    instruction:
      'Check whether the trust template intent and release context are internally consistent. Return approve, missing_evidence, or reject.',
  },
  {
    role: 'risk',
    label: 'Risk Agent',
    expectedDecision: 'pass',
    instruction:
      'Look for stale evidence, refunded/released state, beneficiary mismatch, or suspicious release conditions. Return pass, missing_evidence, or veto.',
  },
].map((agent) => ({
  ...agent,
  identity: agenticIds.find((identity) => identity.role === agent.role) ?? { role: agent.role },
}));

function buildAgentPrompt(agent) {
  return [
    \`You are Brew \${agent.label}.\`,
    'The AI review is advisory only. Do not claim authority to move funds.',
    agent.instruction,
    'Return strict JSON only with this shape:',
    JSON.stringify({
      decision: agent.role === 'risk' ? 'pass | missing_evidence | veto' : 'approve | missing_evidence | reject',
      rationale: ['short reason'],
      riskFlags: ['short risk flag or none'],
      nextAction: agent.expectedDecision,
      receiptSummary: 'one sentence summary for the swarm receipt',
    }),
    'Agentic ID context:',
    JSON.stringify(agent.identity),
    'Trust context:',
    JSON.stringify(reviewContext),
  ].join('\\n\\n');
}

function blockedVote(agent, summary, extra = {}) {
  return {
    role: agent.role,
    agenticId: pickString(agent.identity?.agenticId),
    decision: agent.role === 'risk' ? 'veto' : 'reject',
    rationale: [summary],
    riskFlags: ['workflow_blocked'],
    receiptSummary: summary,
    raw: extra,
  };
}

function normalizeAgentReview(agent, review, raw) {
  return {
    role: agent.role,
    agenticId: pickString(agent.identity?.agenticId),
    decision: pickString(review?.decision).toLowerCase() || 'missing_evidence',
    rationale: asStringArray(review?.rationale),
    riskFlags: asStringArray(review?.riskFlags),
    nextAction: pickString(review?.nextAction),
    receiptSummary: pickString(review?.receiptSummary),
    raw,
  };
}

async function runReviewAgent(agent) {
  const startedAt = new Date().toISOString();

  try {
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
              'You are a Brew review-swarm specialist. Return strict JSON only. Do not include markdown.',
          },
          { role: 'user', content: buildAgentPrompt(agent) },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
    });

    const responseText = await response.text();
    const responseKey = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key');
    const completedAt = new Date().toISOString();

    if (!response.ok) {
      return blockedVote(agent, \`0G Compute returned HTTP \${response.status}\`, {
        responseKey,
        error: responseText.slice(0, 1000),
        startedAt,
        completedAt,
      });
    }

    let body;
    try {
      body = JSON.parse(responseText);
    } catch (error) {
      return blockedVote(agent, '0G Compute response was not JSON.', {
        responseKey,
        error: String(error?.message ?? error),
        raw: responseText.slice(0, 1000),
        startedAt,
        completedAt,
      });
    }

    const responseId = body?.id ?? null;
    const rawContent = body?.choices?.[0]?.message?.content ?? '';
    let review;
    try {
      review = JSON.parse(cleanJsonContent(rawContent));
    } catch (error) {
      return blockedVote(agent, '0G Compute did not return strict JSON review content.', {
        responseId,
        responseKey,
        error: String(error?.message ?? error),
        rawContent: String(rawContent).slice(0, 1000),
        startedAt,
        completedAt,
      });
    }

    return normalizeAgentReview(agent, review, {
      provider: '0g-compute',
      model,
      endpoint: proxyUrl,
      responseId,
      responseKey,
      rawContent,
      startedAt,
      completedAt,
    });
  } catch (error) {
    return blockedVote(agent, '0G Compute request failed.', {
      error: String(error?.message ?? error),
      startedAt,
      completedAt: new Date().toISOString(),
    });
  }
}

const votes = await Promise.all(reviewAgents.map(runReviewAgent));
const decisionByRole = Object.fromEntries(votes.map((vote) => [vote.role, vote.decision]));
const releaseReady =
  decisionByRole.evidence === 'approve' &&
  decisionByRole.policy === 'approve' &&
  decisionByRole.risk === 'pass';
const aggregate = {
  rule: 'evidence approve + policy approve + risk no-veto',
  verdict: releaseReady ? 'ReleaseRecommended' : 'Rejected',
  releaseReady,
  rationale: votes.flatMap((vote) => vote.rationale ?? []),
};

if (!releaseReady) {
  return {
    mode: 'live',
    provider: '0g-compute',
    agentName: 'Brew Review Swarm',
    status: 'reviewed',
    releaseReady: false,
    trustId,
    attestationUid,
    beneficiary,
    templateId,
    decision: aggregate.verdict,
    rationale: aggregate.rationale,
    riskFlags: votes.flatMap((vote) => vote.riskFlags ?? []),
    nextAction: 'do_not_release',
    receiptSummary: 'Brew review swarm did not reach release quorum.',
    agenticIds,
    votes,
    aggregate,
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
    source: 'keeperhub-review-swarm',
    agenticIds,
    votes,
    aggregate,
    review: {
      mode: 'live',
      provider: '0g-compute',
      model,
      endpoint: proxyUrl,
      votes,
      aggregate,
    },
  }),
});

const receiptText = await receiptResponse.text();
let receiptBody;
try {
  receiptBody = receiptText ? JSON.parse(receiptText) : {};
} catch (error) {
  return blocked('Review receipt API response was not JSON.', {
    votes,
    aggregate,
    error: String(error?.message ?? error),
    raw: receiptText.slice(0, 1000),
  });
}

if (!receiptResponse.ok || receiptBody?.configured === false || !receiptBody?.reviewReceipt || !receiptBody?.coordinatorSignature) {
  return blocked('Review receipt API did not return a signed receipt.', {
    votes,
    aggregate,
    receiptStatus: receiptResponse.status,
    receiptBody,
  });
}

return {
  mode: 'live',
  provider: '0g-compute',
  agentName: 'Brew Review Swarm',
  status: 'ready',
  releaseReady: true,
  trustId,
  attestationUid,
  beneficiary,
  templateId,
  decision: aggregate.verdict,
  rationale: aggregate.rationale,
  riskFlags: votes.flatMap((vote) => vote.riskFlags ?? []),
  nextAction: 'trigger_keeperhub',
  receiptSummary: 'Brew review swarm reached release quorum.',
  agenticIds,
  votes,
  aggregate,
  reviewReceipt: receiptBody.reviewReceipt,
  coordinatorSignature: receiptBody.coordinatorSignature,
  receiptDigestInput: receiptBody.receiptDigestInput,
  receiptStorage: receiptBody.receiptStorage,
};`;
}

function agenticIdsFromEnv() {
  const contract = readEnv('BREW_AGENTIC_ID_CONTRACT') ?? '<BREW_AGENTIC_ID_CONTRACT>';
  const chain = readEnv('BREW_AGENTIC_ID_CHAIN') ?? '0g-galileo';
  const authorizedExecutor =
    readEnv('BREW_AGENTIC_AUTHORIZED_EXECUTOR') ?? '<BREW_AGENTIC_AUTHORIZED_EXECUTOR>';

  return ['evidence', 'policy', 'risk'].map((role) => {
    const envPrefix = `BREW_${role.toUpperCase()}_AGENTIC`;
    const tokenId = readEnv(`${envPrefix}_TOKEN_ID`) ?? `<${envPrefix}_TOKEN_ID>`;
    return {
      role,
      agenticId: readEnv(`${envPrefix}_ID`) ?? `${chain}:${contract}/${tokenId}`,
      chain,
      contract,
      tokenId,
      metadataHash: readEnv(`${envPrefix}_METADATA_HASH`) ?? `<${envPrefix}_METADATA_HASH>`,
      authorizedExecutor,
    };
  });
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

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
