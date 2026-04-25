ALTER TABLE `control_publish_requests` ADD `rejection_comment` text;--> statement-breakpoint
CREATE TABLE `control_publish_request_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`approver_member_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `control_publish_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approver_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `control_publish_request_approval_request_id_idx` ON `control_publish_request_approvals` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_publish_request_approval_member_unique` ON `control_publish_request_approvals` (`request_id`,`approver_member_id`);
