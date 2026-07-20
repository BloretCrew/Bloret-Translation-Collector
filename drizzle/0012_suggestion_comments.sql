CREATE TABLE IF NOT EXISTS "suggestion_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD CONSTRAINT "suggestion_comments_suggestion_id_translation_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."translation_suggestions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD CONSTRAINT "suggestion_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD CONSTRAINT "suggestion_comments_parent_id_suggestion_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."suggestion_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_comments_suggestion_idx" ON "suggestion_comments" USING btree ("suggestion_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_comments_author_idx" ON "suggestion_comments" USING btree ("author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_comments_parent_idx" ON "suggestion_comments" USING btree ("parent_id");
