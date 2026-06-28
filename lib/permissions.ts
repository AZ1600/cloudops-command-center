import type { UserRole } from "@/lib/types";

const roleRank: Record<UserRole, number> = {
  viewer: 1,
  engineer: 2,
  admin: 3,
  owner: 4,
};

export function canApprove(role: UserRole) {
  return roleRank[role] >= roleRank.admin;
}

export function canExecute(role: UserRole) {
  return role === "owner" || role === "admin";
}

export function canManageWorkspace(role: UserRole) {
  return role === "owner";
}
