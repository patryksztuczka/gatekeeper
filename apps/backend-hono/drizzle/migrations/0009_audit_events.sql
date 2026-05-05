CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_user_id` text,
	`actor_organization_member_id` text,
	`actor_display_name` text,
	`actor_email` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_display_name` text,
	`target_secondary_label` text,
	`outcome` text DEFAULT 'success' NOT NULL,
	`metadata` text,
	`occurred_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_organization_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_event_organization_occurred_at_idx` ON `audit_events` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_event_organization_actor_member_idx` ON `audit_events` (`organization_id`,`actor_organization_member_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_event_organization_target_idx` ON `audit_events` (`organization_id`,`target_type`,`target_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_event_organization_action_idx` ON `audit_events` (`organization_id`,`action`,`occurred_at`);
