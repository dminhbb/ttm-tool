export const USER_ROLES = ['SUPERADMIN', 'ADMIN', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthUser {
  email: string;
  fullName: string;
  id: number;
  role: UserRole;
}

export interface ManagedUser extends AuthUser {
  domainIds: number[];
  isActive: boolean;
  projectIds: number[];
}

export interface UserInput {
  domainIds: number[];
  email: string;
  fullName: string;
  isActive: boolean;
  password?: string;
  projectIds: number[];
  role: UserRole;
}
