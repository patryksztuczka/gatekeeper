CREATE TABLE `checklist_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`author_member_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_organization_id_idx` ON `checklist_templates` (`organization_id`);--> statement-breakpoint
CREATE INDEX `checklist_template_author_member_id_idx` ON `checklist_templates` (`author_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_organization_name_unique` ON `checklist_templates` (`organization_id`,`normalized_name`);
