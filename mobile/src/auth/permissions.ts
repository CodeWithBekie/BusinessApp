import type { BusinessUserRole } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthContext';

// Hand-mirrored from the server's RolePermissions (server/src/AiBusinessPlatform.Application/Auth/RolePermissions.cs)
// — no shared codegen between the C# and TS sides of this repo, the same convention already used
// for OrderStatus/PaymentProvider-style enums in src/api/client.ts. Keep this in sync by hand.
export type Permission =
  | 'ManageCatalog'
  | 'ManageOrders'
  | 'ManageSuppliers'
  | 'ViewAccounting'
  | 'DecideApprovals'
  | 'ManageBusinessSettings'
  | 'ManageStaff';

const ROLE_PERMISSIONS: Record<BusinessUserRole, Permission[]> = {
  Owner: ['ManageCatalog', 'ManageOrders', 'ManageSuppliers', 'ViewAccounting', 'DecideApprovals', 'ManageBusinessSettings', 'ManageStaff'],
  Manager: ['ManageCatalog', 'ManageOrders', 'ManageSuppliers', 'ViewAccounting', 'DecideApprovals', 'ManageBusinessSettings'],
  Cashier: ['ManageOrders'],
  InventoryClerk: ['ManageCatalog', 'ManageSuppliers'],
  Accountant: ['ViewAccounting'],
};

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role as BusinessUserRole]?.includes(permission) ?? false;
}

// Reads the signed-in role straight from the session (business sessions only — a customer
// session has no role, so this is always false for the marketplace side of the app).
export function useHasPermission(permission: Permission): boolean {
  const { session } = useAuth();
  const role = session?.kind === 'business' ? session.role : undefined;
  return hasPermission(role, permission);
}
