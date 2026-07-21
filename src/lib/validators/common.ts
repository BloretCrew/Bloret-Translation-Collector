import { z } from "zod";

export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug 只能包含小写字母、数字与连字符");

export const localeSchema = z
  .string()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}([_-][a-zA-Z0-9]+)*$/, "无效的语言代码");

export const memberRoleSchema = z.enum([
  "owner",
  "manager",
  "proofreader",
  "translator",
  "viewer",
]);

export const orgVisibilitySchema = z.enum(["private", "public"]);

export const createOrgSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().max(500).optional().nullable(),
  visibility: orgVisibilitySchema.default("private"),
});

const readmeUrlField = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v.trim() === "") return true;
      try {
        const u = new URL(v.trim());
        return u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "README URL 须为 https:// 开头的有效地址" },
  );

const readmeField = z.string().max(100_000).optional().nullable();

/** Icon URL: clear with null/"" or set an https URL (prefer image host). */
export const iconUrlField = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .refine(
    (v) => {
      if (v == null || v.trim() === "") return true;
      try {
        const u = new URL(v.trim());
        return u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "图标 URL 须为 https:// 开头的有效地址" },
  );

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  visibility: orgVisibilitySchema.optional(),
  readme: readmeField,
  readmeUrl: readmeUrlField,
  iconUrl: iconUrlField,
});

export const addMemberSchema = z.object({
  username: z.string().min(1).max(64),
  role: memberRoleSchema.exclude(["owner"]).default("translator"),
});

export const updateMemberSchema = z.object({
  role: memberRoleSchema.exclude(["owner"]),
});

export const projectLanguageSchema = z.object({
  locale: localeSchema,
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().max(500).optional().nullable(),
  sourceLocale: localeSchema.default("en"),
  targetLocales: z.array(localeSchema).min(1).max(50),
  languages: z.array(projectLanguageSchema).min(1).max(50).optional(),
  visibility: z.enum(["private", "org", "public"]).default("org"),
});

export const translationRulesSchema = z.object({
  spaceCjkLatin: z.boolean().optional(),
  spaceCjkDigit: z.boolean().optional(),
  spaceLatinDigit: z.boolean().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  readme: readmeField,
  readmeUrl: readmeUrlField,
  iconUrl: iconUrlField,
  sourceLocale: localeSchema.optional(),
  visibility: z.enum(["private", "org", "public"]).optional(),
  translationRules: translationRulesSchema.optional(),
});

export const setLanguagesSchema = z.object({
  locales: z.array(localeSchema).min(1).max(50).optional(),
  languages: z.array(projectLanguageSchema).min(1).max(50).optional(),
}).superRefine((value, ctx) => {
  if (!value.locales && !value.languages) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "缺少目标语言" });
  }
});

/** Safe project-relative path with a known i18n extension. */
const sourcePathRegex = /^[a-zA-Z0-9_./-]+\.(json|properties)$/;

export const uploadFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(256)
    .regex(sourcePathRegex, "路径须为 .json / .properties 且仅含安全字符"),
  content: z.string().min(1).max(2 * 1024 * 1024),
});

export const uploadBatchSchema = z.object({
  files: z
    .array(uploadFileSchema)
    .min(1, "至少上传一个文件")
    .max(50, "单次最多 50 个文件"),
});

export const saveTranslationSchema = z.object({
  text: z.string().max(50_000),
});

/** Crowdin-style: submit/update my suggestion */
export const saveSuggestionSchema = z.object({
  text: z.string().max(50_000),
  /** When true, do not apply project translation formatting rules. */
  skipRules: z.boolean().optional(),
});

export const stringCommentSchema = z.object({
  body: z.string().min(1).max(5_000),
  /** Reply under an existing top-level comment (same string × locale). */
  parentId: z.string().uuid().optional().nullable(),
});

/** Comment under a translation suggestion (optional reply to another comment). */
export const suggestionCommentSchema = z.object({
  body: z.string().min(1).max(5_000),
  parentId: z.string().uuid().optional().nullable(),
});
