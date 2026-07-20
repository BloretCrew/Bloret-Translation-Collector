ALTER TABLE "source_files" ADD COLUMN IF NOT EXISTS "raw_content" text;
--> statement-breakpoint
ALTER TABLE "source_files" ADD COLUMN IF NOT EXISTS "format_meta" jsonb;
