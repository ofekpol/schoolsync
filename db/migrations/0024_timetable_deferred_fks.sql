-- Deleting a board cascades to blocks, block members, classes, subjects and teachers.
-- NO ACTION checks on the member/subject FKs ran mid-cascade and failed (23503);
-- checking them at commit keeps "in use" refusals while letting the cascade finish.
ALTER TABLE "tt_lesson_blocks" ALTER CONSTRAINT "tt_lesson_blocks_subject_id_tt_subjects_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tt_block_classes" ALTER CONSTRAINT "tt_block_classes_class_id_tt_classes_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tt_block_teachers" ALTER CONSTRAINT "tt_block_teachers_teacher_id_tt_teachers_id_fk" DEFERRABLE INITIALLY DEFERRED;
