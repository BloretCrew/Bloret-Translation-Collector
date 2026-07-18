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

export const createOrgSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().max(500).optional().nullable(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
});

export const addMemberSchema = z.object({
  username: z.string().min(1).max(64),
  role: memberRoleSchema.exclude(["owner"]).default("translator"),
});

export const updateMemberSchema = z.object({
  role: memberRoleSchema.exclude(["owner"]),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().max(500).optional().nullable(),
  sourceLocale: localeSchema.default("en"),
  targetLocales: z.array(localeSchema).min(1).max(50),
  visibility: z.enum(["private", "org"]).default("org"),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  sourceLocale: localeSchema.optional(),
  visibility: z.enum(["private", "org"]).optional(),
});

export const setLanguagesSchema = z.object({
  locales: z.array(localeSchema).min(1).max(50),
});

export const uploadFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-zA-Z0-9_./-]+\.json$/, "路径须为 .json 且仅含安全字符"),
  content: z.string().min(2).max(2 * 1024 * 1024),
});

export const saveTranslationSchema = z.object({
  text: z.string().max(50_000),
});

/** Crowdin-style: submit/update my suggestion */
export const saveSuggestionSchema = z.object({
  text: z.string().max(50_000),
});
