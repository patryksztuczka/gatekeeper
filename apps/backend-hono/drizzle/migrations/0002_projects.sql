CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`slug` text NOT NULL,
	`project_owner_member_id` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_owner_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_organization_id_idx` ON `projects` (`organization_id`);--> statement-breakpoint
CREATE INDEX `project_owner_member_id_idx` ON `projects` (`project_owner_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_organization_slug_unique` ON `projects` (`organization_id`,`slug`);
