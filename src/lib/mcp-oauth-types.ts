export interface McpOAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export type ConsumeAuthorizationCodeResult =
  | { ok: true; clientName: string; userId: number }
  | { error: 'invalid_grant' };
