ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "translation_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;
