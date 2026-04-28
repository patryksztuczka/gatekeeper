CREATE TABLE `checklist_template_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_section_template_id_idx` ON `checklist_template_sections` (`template_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_section_template_name_unique` ON `checklist_template_sections` (`template_id`,`normalized_name`);--> statement-breakpoint
ALTER TABLE `checklist_template_items` ADD `section_id` text REFERENCES checklist_template_sections(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `checklist_template_items` ADD `display_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `checklist_template_item_section_id_idx` ON `checklist_template_items` (`section_id`);
