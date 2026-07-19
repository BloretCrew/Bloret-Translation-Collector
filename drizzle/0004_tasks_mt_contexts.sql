CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"string_id" uuid,
	"file_id" uuid,
	"assignee_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "string_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"string_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_tasks" ADD CONSTRAINT "translation_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_tasks" ADD CONSTRAINT "translation_tasks_string_id_string_units_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."string_units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_tasks" ADD CONSTRAINT "translation_tasks_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."source_files"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_tasks" ADD CONSTRAINT "translation_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "translation_tasks" ADD CONSTRAINT "translation_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_contexts" ADD CONSTRAINT "string_contexts_string_id_string_units_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."string_units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_contexts" ADD CONSTRAINT "string_contexts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_tasks_assignee_idx" ON "translation_tasks" USING btree ("assignee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_tasks_project_locale_idx" ON "translation_tasks" USING btree ("project_id","locale");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "string_contexts_string_idx" ON "string_contexts" USING btree ("string_id");
