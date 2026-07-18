-- Crowdin-style collaboration: suggestions, votes, workflow states, proofreader role

ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'proofreader';
--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('untranslated', 'suggested', 'approved');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translation_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"string_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suggestion_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "string_locale_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"string_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"status" "workflow_status" DEFAULT 'untranslated' NOT NULL,
	"approved_suggestion_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_suggestions" ADD CONSTRAINT "translation_suggestions_string_id_string_units_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."string_units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_suggestions" ADD CONSTRAINT "translation_suggestions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_suggestion_id_translation_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."translation_suggestions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_locale_states" ADD CONSTRAINT "string_locale_states_string_id_string_units_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."string_units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_locale_states" ADD CONSTRAINT "string_locale_states_approved_suggestion_id_translation_suggestions_id_fk" FOREIGN KEY ("approved_suggestion_id") REFERENCES "public"."translation_suggestions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_locale_states" ADD CONSTRAINT "string_locale_states_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "translation_suggestions_author_uidx" ON "translation_suggestions" USING btree ("string_id","locale","author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_suggestions_string_locale_idx" ON "translation_suggestions" USING btree ("string_id","locale");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suggestion_votes_user_uidx" ON "suggestion_votes" USING btree ("suggestion_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_votes_suggestion_idx" ON "suggestion_votes" USING btree ("suggestion_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "string_locale_states_uidx" ON "string_locale_states" USING btree ("string_id","locale");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "string_locale_states_locale_idx" ON "string_locale_states" USING btree ("locale");
--> statement-breakpoint
-- Backfill: existing translations become suggestions + approved state when non-empty
INSERT INTO "translation_suggestions" ("string_id", "locale", "text", "author_id", "created_at", "updated_at")
SELECT t."string_id", t."locale", t."text",
  COALESCE(t."updated_by", (SELECT u."id" FROM "users" u ORDER BY u."created_at" ASC LIMIT 1)),
  COALESCE(t."updated_at", now()), COALESCE(t."updated_at", now())
FROM "translations" t
WHERE coalesce(t."text", '') <> ''
  AND t."updated_by" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- If updated_by is null, still create suggestion with any user as author
INSERT INTO "translation_suggestions" ("string_id", "locale", "text", "author_id", "created_at", "updated_at")
SELECT t."string_id", t."locale", t."text",
  (SELECT u."id" FROM "users" u ORDER BY u."created_at" ASC LIMIT 1),
  COALESCE(t."updated_at", now()), COALESCE(t."updated_at", now())
FROM "translations" t
WHERE coalesce(t."text", '') <> ''
  AND t."updated_by" IS NULL
  AND EXISTS (SELECT 1 FROM "users" LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM "translation_suggestions" s
    WHERE s."string_id" = t."string_id" AND s."locale" = t."locale"
  );
--> statement-breakpoint
INSERT INTO "string_locale_states" ("string_id", "locale", "status", "approved_suggestion_id", "approved_by", "approved_at", "updated_at")
SELECT t."string_id", t."locale",
  CASE WHEN t."status" = 'translated' AND coalesce(t."text",'') <> '' THEN 'approved'::"workflow_status" ELSE 'suggested'::"workflow_status" END,
  s."id",
  t."updated_by",
  CASE WHEN t."status" = 'translated' THEN t."updated_at" ELSE NULL END,
  COALESCE(t."updated_at", now())
FROM "translations" t
LEFT JOIN "translation_suggestions" s
  ON s."string_id" = t."string_id" AND s."locale" = t."locale"
  AND (s."author_id" = t."updated_by" OR t."updated_by" IS NULL)
WHERE coalesce(t."text", '') <> ''
ON CONFLICT DO NOTHING;
