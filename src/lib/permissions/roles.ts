import type { MemberRole } from "@/lib/db/schema";

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 1,
  translator: 2,
  proofreader: 3,
  manager: 4,
  owner: 5,
};

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function canManageOrg(role: MemberRole): boolean {
  return role === "owner";
}

export function canManageProjects(role: MemberRole): boolean {
  return roleAtLeast(role, "manager");
}

export function canUploadFiles(role: MemberRole): boolean {
  return roleAtLeast(role, "manager");
}

/** Submit / update own translation suggestions */
export function canSuggestTranslations(role: MemberRole): boolean {
  return roleAtLeast(role, "translator");
}

/** Vote on others' suggestions */
export function canVoteSuggestions(role: MemberRole): boolean {
  return roleAtLeast(role, "translator");
}

/** Approve a suggestion as final translation */
export function canApproveTranslations(role: MemberRole): boolean {
  return roleAtLeast(role, "proofreader");
}

/** @deprecated use canSuggestTranslations — kept for older call sites */
export function canEditTranslations(role: MemberRole): boolean {
  return canSuggestTranslations(role);
}

export function canExport(role: MemberRole): boolean {
  return roleAtLeast(role, "viewer");
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "所有者",
  manager: "管理员",
  proofreader: "审核员",
  translator: "译者",
  viewer: "访客",
};
