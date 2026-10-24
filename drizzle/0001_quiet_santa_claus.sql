CREATE TABLE `celebrations` (
	`id` text PRIMARY KEY NOT NULL,
	`groom` text NOT NULL,
	`bride` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
