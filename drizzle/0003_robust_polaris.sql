CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`requested_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text
);
