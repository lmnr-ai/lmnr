ALTER TABLE workspaces ADD COLUMN deployment_mode TEXT NOT NULL DEFAULT 'CLOUD';
ALTER TABLE workspaces ADD COLUMN data_plane_url TEXT;
