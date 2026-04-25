CREATE TABLE `draft_controls` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`author_member_id` text NOT NULL,
	`control_code` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `draft_control_organization_id_idx` ON `draft_controls` (`organization_id`);--> statement-breakpoint
CREATE INDEX `draft_control_author_member_id_idx` ON `draft_controls` (`author_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_control_organization_code_unique` ON `draft_controls` (`organization_id`,`control_code`);
