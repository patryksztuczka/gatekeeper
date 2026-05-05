CREATE UNIQUE INDEX `member_id_organization_id_unique` ON `members` (`id`, `organization_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_id_organization_id_unique` ON `projects` (`id`, `organization_id`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `project_assignments_with_organization` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`organization_member_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`, `organization_id`) REFERENCES `projects`(`id`, `organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_member_id`, `organization_id`) REFERENCES `members`(`id`, `organization_id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`role` IN ('project_owner', 'project_contributor'))
);
--> statement-breakpoint
INSERT INTO `project_assignments_with_organization` (
	`id`,
	`organization_id`,
	`project_id`,
	`organization_member_id`,
	`role`,
	`created_at`,
	`updated_at`
)
SELECT
	`project_assignments`.`id`,
	`projects`.`organization_id`,
	`project_assignments`.`project_id`,
	`project_assignments`.`organization_member_id`,
	`project_assignments`.`role`,
	`project_assignments`.`created_at`,
	`project_assignments`.`updated_at`
FROM `project_assignments`
INNER JOIN `projects` ON `project_assignments`.`project_id` = `projects`.`id`
INNER JOIN `members`
	ON `project_assignments`.`organization_member_id` = `members`.`id`
	AND `members`.`organization_id` = `projects`.`organization_id`;
--> statement-breakpoint
DROP TABLE `project_assignments`;
--> statement-breakpoint
ALTER TABLE `project_assignments_with_organization` RENAME TO `project_assignments`;
--> statement-breakpoint
CREATE INDEX `project_assignment_organization_id_idx` ON `project_assignments` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `project_assignment_project_id_idx` ON `project_assignments` (`project_id`);
--> statement-breakpoint
CREATE INDEX `project_assignment_organization_member_id_idx` ON `project_assignments` (`organization_member_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_assignment_project_member_unique` ON `project_assignments` (`project_id`, `organization_member_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_assignment_one_owner_per_project_unique` ON `project_assignments` (`project_id`) WHERE `role` = 'project_owner';
--> statement-breakpoint
PRAGMA foreign_keys=ON;
