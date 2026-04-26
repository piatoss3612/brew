export const BREW_SUBGRAPH_URL =
  'https://api.studio.thegraph.com/query/71401/brew/version/latest';

const BREW_STATUS_QUERY = `
  query BrewStatus {
    trusts(first: 5, orderBy: createdAt, orderDirection: desc) {
      id
      trustId
      sponsor
      beneficiary
      token
      amount
      status
      templateId
      createdAt
      createdTx
      releasedAt
      releasedTx
      refundedAt
      refundedTx
      attestationUid
      verifiedAt
      verifiedTx
    }
    verifierConfigs(first: 1) {
      id
      verifier
      updatedAt
    }
    templates(first: 10, orderBy: registeredAt, orderDirection: asc) {
      id
      templateId
      schemaUid
      expiryWindowSeconds
      stalenessWindowSeconds
      registeredAt
    }
  }
`;

export type TrustStatus = 'PENDING' | 'RELEASED' | 'REFUNDED';

export type BrewTrust = {
  id: string;
  trustId: string;
  sponsor: string;
  beneficiary: string;
  token: string;
  amount: string;
  status: TrustStatus;
  templateId: string;
  createdAt: string;
  createdTx: string;
  releasedAt: string | null;
  releasedTx: string | null;
  refundedAt: string | null;
  refundedTx: string | null;
  attestationUid: string | null;
  verifiedAt: string | null;
  verifiedTx: string | null;
};

export type BrewTemplate = {
  id: string;
  templateId: string;
  schemaUid: string;
  expiryWindowSeconds: string;
  stalenessWindowSeconds: string;
  registeredAt: string;
};

export type BrewStatus = {
  trusts: BrewTrust[];
  verifierConfigs: Array<{
    id: string;
    verifier: string;
    updatedAt: string;
  }>;
  templates: BrewTemplate[];
};

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export async function fetchBrewStatus(): Promise<BrewStatus> {
  const response = await fetch(BREW_SUBGRAPH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: BREW_STATUS_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph request failed: ${response.status}`);
  }

  const payload = (await response.json()) as GraphQlResponse<BrewStatus>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }

  if (!payload.data) {
    throw new Error('Subgraph returned no data');
  }

  return payload.data;
}
