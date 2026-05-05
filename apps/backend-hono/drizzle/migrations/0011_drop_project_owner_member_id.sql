PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `projects_without_owner_member_id` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`slug` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `projects_without_owner_member_id` (
	`id`,
	`organization_id`,
	`name`,
	`description`,
	`slug`,
	`archived_at`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`organization_id`,
	`name`,
	`description`,
	`slug`,
	`archived_at`,
	`created_at`,
	`updated_at`
FROM `projects`;
--> statement-breakpoint
DROP TABLE `projects`;
--> statement-breakpoint
ALTER TABLE `projects_without_owner_member_id` RENAME TO `projects`;
--> statement-breakpoint
CREATE INDEX `project_organization_id_idx` ON `projects` (`organization_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_organization_slug_unique` ON `projects` (`organization_id`,`slug`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
