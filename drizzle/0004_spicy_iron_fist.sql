CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `members` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `members` ADD `invite_hash` text;--> statement-breakpoint
ALTER TABLE `members` ADD `invite_expires` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `last_login` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `locked_until` integer;