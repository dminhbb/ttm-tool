export interface McpSettings {
  isEnabled: boolean;
  updatedAt: string | null;
}

export interface McpAccessToken {
  id: number;
  tokenName: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Only returned once, from the create endpoint — the plaintext token is never stored or
 * retrievable again after this response. */
export interface McpAccessTokenCreated extends McpAccessToken {
  token: string;
}

export interface McpTopUser {
  accessCount: number;
  email: string;
  fullName: string;
  userId: number;
}

export interface McpUsageSummary {
  activeTokenCount: number;
  issuedTokenCount: number;
  topUsers: McpTopUser[];
  weeklyAccessCount: number;
}
