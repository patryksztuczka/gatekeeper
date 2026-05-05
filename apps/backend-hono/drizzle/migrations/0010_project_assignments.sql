CREATE TABLE `project_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_member_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`role` IN ('project_owner', 'project_contributor'))
);
--> statement-breakpoint
INSERT INTO `project_assignments` (
	`id`,
	`project_id`,
	`organization_member_id`,
	`role`,
	`created_at`,
	`updated_at`
)
SELECT
	lower(hex(randomblob(4))) || '-' ||
	lower(hex(randomblob(2))) || '-' ||
	'4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
	substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
	lower(hex(randomblob(6))),
	`id`,
	`project_owner_member_id`,
	'project_owner',
	`created_at`,
	`updated_at`
FROM `projects`
WHERE `project_owner_member_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `project_assignment_project_id_idx` ON `project_assignments` (`project_id`);
--> statement-breakpoint
CREATE INDEX `project_assignment_organization_member_id_idx` ON `project_assignments` (`organization_member_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_assignment_project_member_unique` ON `project_assignments` (`project_id`, `organization_member_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_assignment_one_owner_per_project_unique` ON `project_assignments` (`project_id`) WHERE `role` = 'project_owner';
