import type { MemberRole } from "@/lib/db/schema";

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 1,
  translator: 2,
  manager: 3,
  owner: 4,
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

export function canEditTranslations(role: MemberRole): boolean {
  return roleAtLeast(role, "translator");
}

export function canExport(role: MemberRole): boolean {
  return roleAtLeast(role, "viewer");
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "所有者",
  manager: "管理员",
  translator: "译者",
  viewer: "访客",
};
