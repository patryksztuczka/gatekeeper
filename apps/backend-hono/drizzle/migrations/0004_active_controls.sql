CREATE TABLE `controls` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`current_version_id` text,
	`current_control_code` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `control_organization_id_idx` ON `controls` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_organization_code_unique` ON `controls` (`organization_id`,`current_control_code`);--> statement-breakpoint
CREATE TABLE `control_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`control_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`control_code` text NOT NULL,
	`title` text NOT NULL,
	`business_meaning` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `control_version_control_id_idx` ON `control_versions` (`control_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_version_number_unique` ON `control_versions` (`control_id`,`version_number`);
