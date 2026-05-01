import { NextResponse, type NextRequest } from 'next/server';

import {
  generateReviewReceipt,
  reviewReceiptSignerConfig,
  validateReviewReceiptInput,
  type ReviewReceiptInput,
} from '../../../review-receipt';

function stringField(value: unknown, key: keyof ReviewReceiptInput) {
  if (!value || typeof value !== 'object') return '';
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field.trim() : '';
}

function authError(request: NextRequest) {
  const apiKey = process.env.BREW_REVIEW_RECEIPT_API_KEY;
  if (!apiKey) return null;

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization === `Bearer ${apiKey}`) return null;

  return NextResponse.json({ error: 'Unauthorized review receipt request' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const unauthorized = authError(request);
  if (unauthorized) return unauthorized;

  const config = reviewReceiptSignerConfig();
  if (config.missing.length > 0) {
    return NextResponse.json({
      configured: false,
      missing: config.missing,
    });
  }

  const body = await request.json().catch(() => null);
  const input = {
    trustId: stringField(body, 'trustId'),
    beneficiary: stringField(body, 'beneficiary'),
    attestationUid: stringField(body, 'attestationUid'),
    templateId: stringField(body, 'templateId'),
    review: body && typeof body === 'object' ? (body as Record<string, unknown>).review : undefined,
    source: stringField(body, 'source') || 'review-receipt-api',
  } satisfies ReviewReceiptInput;

  const validationError = validateReviewReceiptInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const generated = await generateReviewReceipt(input);
    return NextResponse.json({
      configured: true,
      ...generated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Review receipt generation failed',
      },
      { status: 500 },
    );
  }
}
