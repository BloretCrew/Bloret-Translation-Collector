CREATE TYPE "public"."org_visibility" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "visibility" "org_visibility" DEFAULT 'private' NOT NULL;
