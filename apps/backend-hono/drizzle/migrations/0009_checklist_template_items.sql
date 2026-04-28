CREATE TABLE `checklist_template_items` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`control_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_item_template_id_idx` ON `checklist_template_items` (`template_id`);--> statement-breakpoint
CREATE INDEX `checklist_template_item_control_id_idx` ON `checklist_template_items` (`control_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_item_template_control_unique` ON `checklist_template_items` (`template_id`,`control_id`);
