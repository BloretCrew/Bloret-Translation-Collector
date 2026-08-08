import type { MemberRole } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 1,
  translator: 2,
  proofreader: 3,
  manager: 4,
  owner: 5,
};

/** Chinese source-as-key labels */
const ROLE_LABEL_KEYS: Record<MemberRole, string> = {
  owner: "所有者",
  manager: "管理员",
  proofreader: "审核员",
  translator: "译者",
  viewer: "访客",
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

/** Request-time translated role label */
export function roleLabel(role: MemberRole): string {
  return t(ROLE_LABEL_KEYS[role] ?? role);
}

/**
 * Proxy so existing `ROLE_LABELS[role]` call sites get current-lang labels.
 * Keys remain stable MemberRole values.
 */
export const ROLE_LABELS: Record<MemberRole, string> = new Proxy({} as Record<MemberRole, string>, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== "string") return undefined;
    if (prop in ROLE_LABEL_KEYS) return roleLabel(prop as MemberRole);
    return undefined;
  },
  ownKeys() {
    return Object.keys(ROLE_LABEL_KEYS);
  },
  getOwnPropertyDescriptor(_t, prop) {
    if (typeof prop === "string" && prop in ROLE_LABEL_KEYS) {
      return { configurable: true, enumerable: true, value: roleLabel(prop as MemberRole) };
    }
    return undefined;
  },
});
