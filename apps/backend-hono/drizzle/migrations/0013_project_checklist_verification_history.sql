ALTER TABLE `project_checklist_verification_records` ADD `not_applicable_explanation` text;--> statement-breakpoint
CREATE TABLE `project_checklist_verification_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_checklist_item_id` text NOT NULL,
	`control_version_id` text NOT NULL,
	`actor_member_id` text NOT NULL,
	`status` text NOT NULL,
	`not_applicable_explanation` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_checklist_item_id`) REFERENCES `project_checklist_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_version_id`) REFERENCES `control_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `project_checklist_verification_history_item_id_idx` ON `project_checklist_verification_history` (`project_checklist_item_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_verification_history_control_version_id_idx` ON `project_checklist_verification_history` (`control_version_id`);--> statement-breakpoint
CREATE INDEX `project_checklist_verification_history_actor_member_id_idx` ON `project_checklist_verification_history` (`actor_member_id`);
