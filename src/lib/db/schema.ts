import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "manager",
  "proofreader",
  "translator",
  "viewer",
]);

export const projectVisibilityEnum = pgEnum("project_visibility", [
  "private",
  "org",
  "public",
]);

export const translationStatusEnum = pgEnum("translation_status", [
  "empty",
  "draft",
  "translated",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("organizations_created_by_idx").on(t.createdBy)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("translator"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("organization_members_org_user_uidx").on(t.orgId, t.userId),
    index("organization_members_user_idx").on(t.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sourceLocale: text("source_locale").notNull().default("en"),
    visibility: projectVisibilityEnum("visibility").notNull().default("org"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("projects_org_slug_uidx").on(t.orgId, t.slug),
    index("projects_org_idx").on(t.orgId),
  ],
);

export const projectLanguages = pgTable(
  "project_languages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    displayName: text("display_name"),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("project_languages_project_locale_uidx").on(t.projectId, t.locale)],
);

export const sourceFiles = pgTable(
  "source_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    format: text("format").notNull().default("json"),
    sourceRevision: integer("source_revision").notNull().default(1),
    rawSource: jsonb("raw_source").notNull().$type<Record<string, unknown>>(),
    contentHash: text("content_hash"),
    orphanedKeys: jsonb("orphaned_keys").$type<string[]>().default([]),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("source_files_project_path_uidx").on(t.projectId, t.path),
    index("source_files_project_idx").on(t.projectId),
  ],
);

export const stringUnits = pgTable(
  "string_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "cascade" }),
    keyPath: text("key_path").notNull(),
    sourceText: text("source_text").notNull(),
    context: text("context"),
    sortOrder: integer("sort_order").notNull().default(0),
    orphaned: boolean("orphaned").notNull().default(false),
  },
  (t) => [
    uniqueIndex("string_units_file_key_uidx").on(t.fileId, t.keyPath),
    index("string_units_file_idx").on(t.fileId),
  ],
);

/** Approved / publish-ready translation mirror (one per string × locale). */
export const translations = pgTable(
  "translations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stringId: uuid("string_id")
      .notNull()
      .references(() => stringUnits.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    text: text("text").notNull().default(""),
    status: translationStatusEnum("status").notNull().default("empty"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("translations_string_locale_uidx").on(t.stringId, t.locale),
    index("translations_locale_idx").on(t.locale),
  ],
);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "untranslated",
  "suggested",
  "approved",
]);

/** Crowdin-style suggestions: one row per author × string × locale. */
export const translationSuggestions = pgTable(
  "translation_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stringId: uuid("string_id")
      .notNull()
      .references(() => stringUnits.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    text: text("text").notNull().default(""),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("translation_suggestions_author_uidx").on(t.stringId, t.locale, t.authorId),
    index("translation_suggestions_string_locale_idx").on(t.stringId, t.locale),
  ],
);

export const suggestionVotes = pgTable(
  "suggestion_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => translationSuggestions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("suggestion_votes_user_uidx").on(t.suggestionId, t.userId),
    index("suggestion_votes_suggestion_idx").on(t.suggestionId),
  ],
);

/** Workflow state for string × locale (approved suggestion pointer). */
export const stringLocaleStates = pgTable(
  "string_locale_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stringId: uuid("string_id")
      .notNull()
      .references(() => stringUnits.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    status: workflowStatusEnum("status").notNull().default("untranslated"),
    approvedSuggestionId: uuid("approved_suggestion_id").references(
      () => translationSuggestions.id,
      { onDelete: "set null" },
    ),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("string_locale_states_uidx").on(t.stringId, t.locale),
    index("string_locale_states_locale_idx").on(t.locale),
  ],
);

/** Crowdin-style discussion on a string × locale */
export const stringComments = pgTable(
  "string_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stringId: uuid("string_id")
      .notNull()
      .references(() => stringUnits.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("string_comments_string_locale_idx").on(t.stringId, t.locale),
    index("string_comments_author_idx").on(t.authorId),
  ],
);

/** Project glossary (terminology) — Crowdin-style terms */
export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceTerm: text("source_term").notNull(),
    description: text("description"),
    caseSensitive: boolean("case_sensitive").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("glossary_terms_project_idx").on(t.projectId),
    uniqueIndex("glossary_terms_project_source_uidx").on(t.projectId, t.sourceTerm),
  ],
);

export const glossaryTranslations = pgTable(
  "glossary_translations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    termId: uuid("term_id")
      .notNull()
      .references(() => glossaryTerms.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    translation: text("translation").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("glossary_translations_term_locale_uidx").on(t.termId, t.locale)],
);

/** Per-locale assignees (translator / proofreader for a language) */
export const projectLocaleAssignees = pgTable(
  "project_locale_assignees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("proofreader"), // translator | proofreader
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_locale_assignees_uidx").on(t.projectId, t.locale, t.userId, t.kind),
    index("project_locale_assignees_project_locale_idx").on(t.projectId, t.locale),
  ],
);

export const taskStatusEnum = pgEnum("task_status", ["todo", "doing", "done"]);

/** Crowdin-style work items: assign string×locale (or whole file×locale) to a user */
export const translationTasks = pgTable(
  "translation_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    stringId: uuid("string_id").references(() => stringUnits.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => sourceFiles.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: taskStatusEnum("status").notNull().default("todo"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("translation_tasks_assignee_idx").on(t.assigneeId),
    index("translation_tasks_project_locale_idx").on(t.projectId, t.locale),
  ],
);

/** Screenshot / context image attached to a source string */
export const stringContexts = pgTable(
  "string_contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stringId: uuid("string_id")
      .notNull()
      .references(() => stringUnits.id, { onDelete: "cascade" }),
    /** Absolute image URL (Bloret Image Host, e.g. https://img.bloret.net/img/…) */
    imageUrl: text("image_url").notNull(),
    caption: text("caption"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("string_contexts_string_idx").on(t.stringId)],
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(organizationMembers),
  projects: many(projects),
  creator: one(users, {
    fields: [organizations.createdBy],
    references: [users.id],
  }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  languages: many(projectLanguages),
  files: many(sourceFiles),
  glossaryTerms: many(glossaryTerms),
  localeAssignees: many(projectLocaleAssignees),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
}));

export const projectLanguagesRelations = relations(projectLanguages, ({ one }) => ({
  project: one(projects, {
    fields: [projectLanguages.projectId],
    references: [projects.id],
  }),
}));

export const glossaryTermsRelations = relations(glossaryTerms, ({ one, many }) => ({
  project: one(projects, {
    fields: [glossaryTerms.projectId],
    references: [projects.id],
  }),
  translations: many(glossaryTranslations),
}));

export const glossaryTranslationsRelations = relations(glossaryTranslations, ({ one }) => ({
  term: one(glossaryTerms, {
    fields: [glossaryTranslations.termId],
    references: [glossaryTerms.id],
  }),
}));

export const projectLocaleAssigneesRelations = relations(projectLocaleAssignees, ({ one }) => ({
  project: one(projects, {
    fields: [projectLocaleAssignees.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectLocaleAssignees.userId],
    references: [users.id],
  }),
}));

export const sourceFilesRelations = relations(sourceFiles, ({ one, many }) => ({
  project: one(projects, {
    fields: [sourceFiles.projectId],
    references: [projects.id],
  }),
  strings: many(stringUnits),
}));

export const stringUnitsRelations = relations(stringUnits, ({ one, many }) => ({
  file: one(sourceFiles, {
    fields: [stringUnits.fileId],
    references: [sourceFiles.id],
  }),
  translations: many(translations),
  suggestions: many(translationSuggestions),
  localeStates: many(stringLocaleStates),
}));

export const translationsRelations = relations(translations, ({ one }) => ({
  stringUnit: one(stringUnits, {
    fields: [translations.stringId],
    references: [stringUnits.id],
  }),
}));

export const translationSuggestionsRelations = relations(
  translationSuggestions,
  ({ one, many }) => ({
    stringUnit: one(stringUnits, {
      fields: [translationSuggestions.stringId],
      references: [stringUnits.id],
    }),
    author: one(users, {
      fields: [translationSuggestions.authorId],
      references: [users.id],
    }),
    votes: many(suggestionVotes),
  }),
);

export const suggestionVotesRelations = relations(suggestionVotes, ({ one }) => ({
  suggestion: one(translationSuggestions, {
    fields: [suggestionVotes.suggestionId],
    references: [translationSuggestions.id],
  }),
  user: one(users, {
    fields: [suggestionVotes.userId],
    references: [users.id],
  }),
}));

export const stringLocaleStatesRelations = relations(stringLocaleStates, ({ one }) => ({
  stringUnit: one(stringUnits, {
    fields: [stringLocaleStates.stringId],
    references: [stringUnits.id],
  }),
  approvedSuggestion: one(translationSuggestions, {
    fields: [stringLocaleStates.approvedSuggestionId],
    references: [translationSuggestions.id],
  }),
}));

export const stringCommentsRelations = relations(stringComments, ({ one }) => ({
  stringUnit: one(stringUnits, {
    fields: [stringComments.stringId],
    references: [stringUnits.id],
  }),
  author: one(users, {
    fields: [stringComments.authorId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type SourceFile = typeof sourceFiles.$inferSelect;
export type StringUnit = typeof stringUnits.$inferSelect;
export type Translation = typeof translations.$inferSelect;
export type TranslationSuggestion = typeof translationSuggestions.$inferSelect;
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type TranslationTask = typeof translationTasks.$inferSelect;
export type StringContext = typeof stringContexts.$inferSelect;
