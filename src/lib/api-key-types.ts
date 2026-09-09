export interface ApiKey {
  id: number;
  keyName: string;
  appName: string;
  apiKey: string;
  isActive: boolean;
  isUnlimited: boolean;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyInput {
  keyName: string;
  appName: string;
  apiKey: string;
  isActive: boolean;
  isUnlimited: boolean;
  validFrom: string | null;
  validTo: string | null;
}
