CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_status` ON `access_requests` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `requests_record_user_status` ON `access_requests` (`record_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_record` ON `audit` (`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `grants` (
	`record_id` text NOT NULL,
	`user_id` text NOT NULL,
	`granted_by` text NOT NULL,
	`expires_at` integer,
	`created_at` text NOT NULL,
	PRIMARY KEY(`record_id`, `user_id`),
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `record_locks` (
	`record_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`email` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`owner_id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_module` ON `records` (`module`,`archived`);--> statement-breakpoint
CREATE INDEX `records_owner` ON `records` (`owner_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);