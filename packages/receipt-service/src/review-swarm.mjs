const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const REVIEW_AGENTS = [
  {
    role: 'evidence',
    label: 'Evidence Agent',
    expectedDecision: 'approve',
    instruction:
      'Check whether the attestation UID, beneficiary, template ID, and trust fields are complete enough to hand off to the onchain verifier. The onchain verifier will validate EAS details; do not require offchain attestation body content in this advisory review. Return approve, missing_evidence, or reject.',
  },
  {
    role: 'policy',
    label: 'Policy Agent',
    expectedDecision: 'approve',
    instruction:
      'Check whether the trust template ID and release context are internally consistent. The template ID comes from the onchain BrewEscrow trust state and is the policy reference available to this review. Do not return missing_evidence only because a separate template registration transaction or template text is absent. Return approve when trustId, beneficiary, templateId, and attestationUid are present and no concrete inconsistency is found. Return approve, missing_evidence, or reject.',
  },
  {
    role: 'risk',
    label: 'Risk Agent',
    expectedDecision: 'pass',
    instruction:
      'Look for stale evidence, refunded/released state, beneficiary mismatch, or suspicious release conditions. Return pass, missing_evidence, or veto.',
  },
];

export function validateReviewComputeConfig(config) {
  const missing = [];
  if (!config?.proxyUrl) missing.push('OG_COMPUTE_PROXY_URL or OG_COMPUTE_SERVICE_URL');
  if (!config?.model) missing.push('OG_COMPUTE_MODEL');
  if (!config?.appSecret) missing.push('OG_COMPUTE_APP_SECRET');
  return missing;
}

export async function runReviewSwarm(input, config, options = {}) {
  const missing = validateReviewComputeConfig(config);
  if (missing.length > 0) {
    return blockedReview(input, `0G Compute is not configured: ${missing.join(', ')}`);
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return blockedReview(input, 'Fetch is not available in this runtime.');
  }

  const reviewContext = buildReviewContext(input);
  const agenticIds = normalizeAgenticIds(input.agenticIds);
  const agents = REVIEW_AGENTS.map((agent) => ({
    ...agent,
    identity: agenticIds.find((identity) => identity.role === agent.role) ?? { role: agent.role },
  }));
  const votes = [];
  for (const agent of agents) {
    votes.push(await runReviewAgent(agent, reviewContext, config, fetchImpl));
  }
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

  return {
    mode: 'live',
    provider: '0g-compute',
    agentName: 'Brew Review Swarm',
    status: releaseReady ? 'ready' : 'reviewed',
    releaseReady,
    trustId: input.trustId,
    attestationUid: input.attestationUid,
    beneficiary: input.beneficiary,
    templateId: input.templateId,
    decision: aggregate.verdict,
    rationale: aggregate.rationale,
    riskFlags: votes.flatMap((vote) => vote.riskFlags ?? []),
    nextAction: releaseReady ? 'trigger_keeperhub' : 'do_not_release',
    receiptSummary: releaseReady
      ? 'Brew review swarm reached release quorum.'
      : 'Brew review swarm did not reach release quorum.',
    agenticIds,
    votes,
    aggregate,
  };
}

function buildReviewContext(input) {
  return withoutUndefined({
    trustId: input.trustId,
    beneficiary: input.beneficiary,
    templateId: input.templateId,
    token: optionalString(input.token),
    amount: optionalString(input.amount),
    deadline: optionalString(input.deadline),
    released: input.released === true,
    refunded: input.refunded === true,
    attestationUid: input.attestationUid,
    templateReference: 'templateId read from onchain BrewEscrow trust state',
    templateRegistrationEvidence:
      'The verifier contract performs authoritative template and EAS checks during verifyAndReleaseWithReceiptFields.',
    escrowAddress: optionalAddress(input.escrowAddress),
    verifierAddress: optionalAddress(input.verifierAddress),
    schemaUid: optionalBytes32(input.schemaUid),
  });
}

function buildAgentPrompt(agent, reviewContext) {
  return [
    `You are Brew ${agent.label}.`,
    'The AI review is advisory only. Do not claim authority to move funds.',
    agent.instruction,
    'Return strict JSON only with this shape:',
    JSON.stringify({
      decision:
        agent.role === 'risk'
          ? 'pass | missing_evidence | veto'
          : 'approve | missing_evidence | reject',
      rationale: ['short reason'],
      riskFlags: ['short risk flag or none'],
      nextAction: agent.expectedDecision,
      receiptSummary: 'one sentence summary for the swarm receipt',
    }),
    'Agentic ID context:',
    JSON.stringify(agent.identity),
    'Trust context:',
    JSON.stringify(reviewContext),
  ].join('\n\n');
}

async function runReviewAgent(agent, reviewContext, config, fetchImpl) {
  const startedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetchImpl(config.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.appSecret}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a Brew review-swarm specialist. Return strict JSON only. Do not include markdown.',
            },
            { role: 'user', content: buildAgentPrompt(agent, reviewContext) },
          ],
          temperature: 0,
          max_tokens: config.maxTokens,
        }),
        signal: controller.signal,
      });
      const responseText = await response.text();
      const responseKey = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key');
      const completedAt = new Date().toISOString();

      if (!response.ok) {
        return blockedVote(agent, `0G Compute returned HTTP ${response.status}`, {
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
        model: config.model,
        endpoint: config.proxyUrl,
        responseId,
        responseKey,
        rawContent,
        startedAt,
        completedAt,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return blockedVote(agent, '0G Compute request failed.', {
      error: String(error?.message ?? error),
      startedAt,
      completedAt: new Date().toISOString(),
    });
  }
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

function blockedReview(input, summary) {
  const votes = REVIEW_AGENTS.map((agent) => blockedVote(agent, summary));
  return {
    mode: 'live',
    provider: '0g-compute',
    agentName: 'Brew Review Swarm',
    status: 'blocked',
    releaseReady: false,
    trustId: input.trustId,
    attestationUid: input.attestationUid,
    beneficiary: input.beneficiary,
    templateId: input.templateId,
    decision: 'Rejected',
    rationale: [summary],
    riskFlags: ['workflow_blocked'],
    nextAction: 'do_not_release',
    receiptSummary: summary,
    agenticIds: normalizeAgenticIds(input.agenticIds),
    votes,
    aggregate: {
      rule: 'evidence approve + policy approve + risk no-veto',
      verdict: 'Rejected',
      releaseReady: false,
      rationale: [summary],
    },
  };
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

function normalizeAgenticIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) =>
      withoutUndefined({
        role: pickString(item.role) || `agent-${index + 1}`,
        agenticId: optionalString(item.agenticId),
        chain: optionalString(item.chain),
        contract: optionalString(item.contract),
        tokenId: optionalString(item.tokenId),
        metadataHash: optionalString(item.metadataHash),
        authorizedExecutor: optionalString(item.authorizedExecutor),
      }),
    );
}

function cleanJsonContent(content) {
  return String(content ?? '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalAddress(value) {
  const text = optionalString(value);
  return text && ADDRESS_PATTERN.test(text) ? text : undefined;
}

function optionalBytes32(value) {
  const text = optionalString(value);
  return text && BYTES32_PATTERN.test(text) ? text : undefined;
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  }
  return '';
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
