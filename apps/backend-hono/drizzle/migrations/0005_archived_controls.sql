ALTER TABLE `controls` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `controls` ADD `archived_by_member_id` text REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `controls` ADD `archive_reason` text;--> statement-breakpoint
CREATE INDEX `control_archived_by_member_id_idx` ON `controls` (`archived_by_member_id`);
