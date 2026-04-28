ALTER TABLE `checklist_template_items` ADD `removed_at` integer;--> statement-breakpoint
ALTER TABLE `project_checklist_items` ADD `removed_from_template_at` integer;
