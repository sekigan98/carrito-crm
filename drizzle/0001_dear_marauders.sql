DROP INDEX `requests_record_user_status`;--> statement-breakpoint
ALTER TABLE `access_requests` ADD `decision_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `requests_record_user_pending` ON `access_requests` (`record_id`,`user_id`) WHERE "access_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE `records` ADD `mutation_token` text;