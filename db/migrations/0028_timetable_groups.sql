-- timeTable: class names and types, subjects taught in groups per grade, named groups in a cluster.
ALTER TABLE tt_classes ADD COLUMN name text CHECK (char_length(name) BETWEEN 1 AND 60);
ALTER TABLE tt_classes ADD COLUMN kind text CHECK (char_length(kind) BETWEEN 1 AND 30);
ALTER TABLE tt_subjects ADD COLUMN group_grades integer[] NOT NULL DEFAULT '{}'
  CHECK (group_grades <@ ARRAY[7, 8, 9, 10, 11, 12]);
ALTER TABLE tt_block_teachers ADD COLUMN group_name text CHECK (char_length(group_name) BETWEEN 1 AND 60);
