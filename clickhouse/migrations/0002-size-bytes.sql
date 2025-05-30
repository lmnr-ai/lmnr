ALTER TABLE default.spans ADD COLUMN size_bytes UInt64 DEFAULT 0;
ALTER TABLE default.browser_session_events ADD COLUMN size_bytes UInt64 DEFAULT 0;
