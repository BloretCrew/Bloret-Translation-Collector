-- Emoji reactions on suggestions, suggestion comments, and string discussion comments.
-- Shape matches Bloret BBS: { "👍": ["alice", "bob"], "❤️": ["carol"] }
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emoji_stats" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "translation_suggestions" ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "string_comments" ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '{}'::jsonb NOT NULL;
