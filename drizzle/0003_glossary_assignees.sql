CREATE TABLE IF NOT EXISTS "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_term" text NOT NULL,
	"description" text,
	"case_sensitive" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "glossary_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"translation" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_locale_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'proofreader' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "glossary_translations" ADD CONSTRAINT "glossary_translations_term_id_glossary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."glossary_terms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_locale_assignees" ADD CONSTRAINT "project_locale_assignees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_locale_assignees" ADD CONSTRAINT "project_locale_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "glossary_terms_project_idx" ON "glossary_terms" USING btree ("project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "glossary_terms_project_source_uidx" ON "glossary_terms" USING btree ("project_id","source_term");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "glossary_translations_term_locale_uidx" ON "glossary_translations" USING btree ("term_id","locale");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_locale_assignees_uidx" ON "project_locale_assignees" USING btree ("project_id","locale","user_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_locale_assignees_project_locale_idx" ON "project_locale_assignees" USING btree ("project_id","locale");
