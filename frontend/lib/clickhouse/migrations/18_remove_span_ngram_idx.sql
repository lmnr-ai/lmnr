ALTER TABLE spans DROP INDEX IF EXISTS input_case_insensitive_idx;
ALTER TABLE spans DROP INDEX IF EXISTS output_case_insensitive_idx;
ALTER TABLE spans DROP INDEX IF EXISTS input_case_insensitive_fivegram_bf;
ALTER TABLE spans DROP INDEX IF EXISTS output_case_insensitive_fivegram_bf;
