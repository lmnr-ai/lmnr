import { type TableConfig } from "../model/table-config-store";
import { type ViewParams } from "./params";

// Wire shape: column config (TableConfig fields) merged with view-managed
// runtime params (filters/search/sort). Keeping them flat under `config` so
// the existing Postgres JSONB column doesn't need a structural migration.
export type ViewConfig = Partial<TableConfig> & Partial<ViewParams>;

export interface View {
  id: string;
  projectId: string;
  resource: string;
  name: string;
  config: ViewConfig;
  createdAt: string;
  updatedAt: string;
}
