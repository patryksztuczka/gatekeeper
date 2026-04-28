DROP INDEX `project_checklist_component_template_unique`;--> statement-breakpoint
DROP INDEX `project_checklist_component_display_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_active_component_template_unique` ON `project_checklists` (`component_id`,`template_id`) WHERE `archived_at` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `project_checklist_component_display_name_unique` ON `project_checklists` (`component_id`,`normalized_display_name`) WHERE `archived_at` IS NULL;
