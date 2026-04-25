CREATE TABLE `control_publish_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`author_member_id` text NOT NULL,
	`request_type` text NOT NULL,
	`draft_control_id` text,
	`control_id` text,
	`proposed_update_id` text,
	`control_code` text NOT NULL,
	`title` text NOT NULL,
	`business_meaning` text NOT NULL,
	`verification_method` text NOT NULL,
	`accepted_evidence_types` text NOT NULL,
	`applicability_conditions` text NOT NULL,
	`release_impact` text NOT NULL,
	`external_standards_mappings` text NOT NULL,
	`approval_count` integer DEFAULT 0 NOT NULL,
	`required_approval_count` integer NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`draft_control_id`) REFERENCES `draft_controls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_update_id`) REFERENCES `control_proposed_updates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `control_publish_request_organization_id_idx` ON `control_publish_requests` (`organization_id`);--> statement-breakpoint
CREATE INDEX `control_publish_request_author_member_id_idx` ON `control_publish_requests` (`author_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_publish_request_draft_unique` ON `control_publish_requests` (`draft_control_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `control_publish_request_proposed_update_unique` ON `control_publish_requests` (`proposed_update_id`);
