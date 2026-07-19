CREATE TABLE IF NOT EXISTS "string_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"string_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_comments" ADD CONSTRAINT "string_comments_string_id_string_units_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."string_units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "string_comments" ADD CONSTRAINT "string_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "string_comments_string_locale_idx" ON "string_comments" USING btree ("string_id","locale");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "string_comments_author_idx" ON "string_comments" USING btree ("author_id");
