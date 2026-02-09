ALTER TABLE spans ADD COLUMN IF NOT EXISTS events Array(Tuple(timestamp Int64, name String, attributes String)) DEFAULT [];
