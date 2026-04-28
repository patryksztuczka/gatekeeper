CREATE TABLE `project_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`component_id` text NOT NULL,
	`template_id` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_display_name` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `project_components`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `project_checklist_component_id_idx` ON `project_checklists` (`component_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_template_id_idx` ON `project_checklists` (`template_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_component_template_unique` ON `project_checklists` (`component_id`,`template_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_component_display_name_unique` ON `project_checklists` (`component_id`,`normalized_display_name`);--> statement-breakpoint
CREATE TABLE `project_checklist_verification_records` (
	`id` text PRIMARY KEY NOT NULL,
	`control_version_id` text NOT NULL,
	`status` text DEFAULT 'unchecked' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`control_version_id`) REFERENCES `control_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `project_checklist_verification_control_version_id_idx` ON `project_checklist_verification_records` (`control_version_id`);--> statement-breakpoint
CREATE TABLE `project_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_checklist_id` text NOT NULL,
	`template_item_id` text NOT NULL,
	`control_id` text NOT NULL,
	`control_version_id` text NOT NULL,
	`verification_record_id` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_checklist_id`) REFERENCES `project_checklists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_item_id`) REFERENCES `checklist_template_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`control_version_id`) REFERENCES `control_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`verification_record_id`) REFERENCES `project_checklist_verification_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `project_checklist_item_project_checklist_id_idx` ON `project_checklist_items` (`project_checklist_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_item_template_item_id_idx` ON `project_checklist_items` (`template_item_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_item_control_id_idx` ON `project_checklist_items` (`control_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_item_control_version_id_idx` ON `project_checklist_items` (`control_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_item_verification_record_unique` ON `project_checklist_items` (`verification_record_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_item_template_item_unique` ON `project_checklist_items` (`project_checklist_id`,`template_item_id`);
