CREATE TABLE `checklist_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_organization_id_idx` ON `checklist_templates` (`organization_id`);--> statement-breakpoint
CREATE INDEX `checklist_template_archived_at_idx` ON `checklist_templates` (`archived_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_active_name_unique` ON `checklist_templates` (`organization_id`,`name`) WHERE `archived_at` is null;--> statement-breakpoint
CREATE TABLE `checklist_template_controls` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_template_id` text NOT NULL,
	`control_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`checklist_template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_control_template_id_idx` ON `checklist_template_controls` (`checklist_template_id`);--> statement-breakpoint
CREATE INDEX `checklist_template_control_control_id_idx` ON `checklist_template_controls` (`control_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_control_unique` ON `checklist_template_controls` (`checklist_template_id`,`control_id`);--> statement-breakpoint
CREATE TABLE `project_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_checklist_template_id` text,
	`name` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_checklist_template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_checklist_project_id_idx` ON `project_checklists` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_source_template_id_idx` ON `project_checklists` (`source_checklist_template_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_archived_at_idx` ON `project_checklists` (`archived_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_active_name_unique` ON `project_checklists` (`project_id`,`name`) WHERE `archived_at` is null;--> statement-breakpoint
CREATE UNIQUE INDEX `control_version_control_id_id_unique` ON `control_versions` (`control_id`,`id`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_checklist_id` text NOT NULL,
	`control_id` text NOT NULL,
	`control_version_id` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_checklist_id`) REFERENCES `project_checklists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_version_id`) REFERENCES `control_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`,`control_version_id`) REFERENCES `control_versions`(`control_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_item_project_checklist_id_idx` ON `checklist_items` (`project_checklist_id`);--> statement-breakpoint
CREATE INDEX `checklist_item_control_id_idx` ON `checklist_items` (`control_id`);--> statement-breakpoint
CREATE INDEX `checklist_item_control_version_id_idx` ON `checklist_items` (`control_version_id`);--> statement-breakpoint
CREATE INDEX `checklist_item_status_idx` ON `checklist_items` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_item_active_control_unique` ON `checklist_items` (`project_checklist_id`,`control_id`) WHERE `status` = 'active';
