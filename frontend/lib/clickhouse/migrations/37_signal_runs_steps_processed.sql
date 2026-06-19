-- Add steps_processed column to signal_runs table
ALTER TABLE signal_runs ADD COLUMN IF NOT EXISTS steps_processed UInt32 DEFAULT 0;
