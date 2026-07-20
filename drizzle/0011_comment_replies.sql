ALTER TABLE "string_comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "string_comments" ADD CONSTRAINT "string_comments_parent_id_string_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."string_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "string_comments_parent_idx" ON "string_comments" USING btree ("parent_id");
