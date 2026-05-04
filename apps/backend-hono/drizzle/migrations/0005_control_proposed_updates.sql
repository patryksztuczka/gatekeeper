CREATE TABLE `control_proposed_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`control_id` text NOT NULL,
	`author_member_id` text NOT NULL,
	`title` text NOT NULL,
	`business_meaning` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `control_proposed_update_organization_id_idx` ON `control_proposed_updates` (`organization_id`);--> statement-breakpoint
CREATE INDEX `control_proposed_update_author_member_id_idx` ON `control_proposed_updates` (`author_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_proposed_update_control_id_unique` ON `control_proposed_updates` (`control_id`);
