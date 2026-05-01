export const DEFAULT_KEEPERHUB_WEBHOOK_TIMEOUT_MS = 60_000;

export function validateKeeperHubWebhookConfig(config) {
  const missing = [];
  if (!config?.webhookUrl) missing.push('KEEPERHUB_WEBHOOK_URL');
  return missing;
}

export function buildVerifyAndReleaseArgs({ input, reviewReceipt, coordinatorSignature }) {
  return [
    input.trustId,
    input.beneficiary,
    input.attestationUid,
    reviewReceipt.receiptRoot,
    reviewReceipt.receiptUri,
    reviewReceipt.coordinator,
    reviewReceipt.createdAt,
    reviewReceipt.expiresAt,
    coordinatorSignature,
  ];
}

export function buildKeeperHubWebhookPayload({
  input,
  reviewReceipt,
  coordinatorSignature,
  receiptStorage,
  receiptDigestInput,
}) {
  return withoutUndefined({
    source: 'brew-receipt-service',
    action: 'verifyAndReleaseWithReceiptFields',
    trustId: input.trustId,
    beneficiary: input.beneficiary,
    attestationUid: input.attestationUid,
    templateId: reviewReceipt.templateId,
    reviewReceipt,
    coordinatorSignature,
    receiptStorage,
    receiptDigestInput,
    contractCall: {
      functionName: 'verifyAndReleaseWithReceiptFields',
      args: buildVerifyAndReleaseArgs({ input, reviewReceipt, coordinatorSignature }),
    },
  });
}

export async function triggerKeeperHubWebhook({
  input,
  reviewReceipt,
  coordinatorSignature,
  receiptStorage,
  receiptDigestInput,
  config,
  fetchImpl = fetch,
}) {
  const missing = validateKeeperHubWebhookConfig(config);
  if (missing.length > 0) {
    throw new Error(`KeeperHub webhook is not configured: ${missing.join(', ')}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? DEFAULT_KEEPERHUB_WEBHOOK_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(config.webhookUrl, {
      method: 'POST',
      headers: withoutUndefined({
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: config.webhookApiKey ? `Bearer ${config.webhookApiKey}` : undefined,
        'x-api-key': config.webhookApiKey,
      }),
      body: JSON.stringify(
        buildKeeperHubWebhookPayload({
          input,
          reviewReceipt,
          coordinatorSignature,
          receiptStorage,
          receiptDigestInput,
        }),
      ),
      signal: controller.signal,
    });
    const text = await response.text();
    const body = parseResponse(text);

    if (!response.ok) {
      throw new Error(`KeeperHub webhook failed: ${response.status} ${stringifyBody(body)}`);
    }

    return body;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('KeeperHub webhook timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function stringifyBody(body) {
  return typeof body?.raw === 'string' ? body.raw.slice(0, 400) : JSON.stringify(body);
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
