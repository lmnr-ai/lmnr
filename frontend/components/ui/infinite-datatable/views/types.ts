import { type TableConfig } from "../model/table-config-store";

export interface View {
  id: string;
  projectId: string;
  resourceType: string;
  name: string;
  config: Partial<TableConfig>;
  createdAt: string;
  updatedAt: string;
}
