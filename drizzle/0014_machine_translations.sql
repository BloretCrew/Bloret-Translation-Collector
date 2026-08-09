CREATE TABLE IF NOT EXISTS "machine_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid,
	"locale" text NOT NULL,
	"key_path" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"raw" jsonb,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machine_translations" ADD CONSTRAINT "machine_translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "machine_translations" ADD CONSTRAINT "machine_translations_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "source_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "machine_translations" ADD CONSTRAINT "machine_translations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "machine_translations_project_file_locale_key_uidx" ON "machine_translations" USING btree ("project_id","file_id","locale","key_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_translations_project_locale_idx" ON "machine_translations" USING btree ("project_id","locale");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_translations_file_idx" ON "machine_translations" USING btree ("file_id");
