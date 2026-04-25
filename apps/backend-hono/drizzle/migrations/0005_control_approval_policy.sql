ALTER TABLE `organizations` ADD `control_approval_policy_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `control_approval_required_count` integer DEFAULT 1 NOT NULL;
