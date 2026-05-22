CREATE TABLE `usage_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`characters_processed` integer,
	`tokens_consumed` integer,
	`timestamp` integer DEFAULT (current_timestamp),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);