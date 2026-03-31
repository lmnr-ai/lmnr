import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const filters: ColumnFilter[] = [
  {
    key: "session_id",
    name: "Session ID",
    dataType: "string",
  },
  {
    key: "user_id",
    name: "User ID",
    dataType: "string",
  },
  {
    key: "trace_count",
    name: "Trace Count",
    dataType: "number",
  },
  {
    key: "duration",
    name: "Duration",
    dataType: "number",
  },
  {
    key: "total_tokens",
    name: "Total Tokens",
    dataType: "number",
  },
  {
    key: "input_tokens",
    name: "Input Tokens",
    dataType: "number",
  },
  {
    key: "output_tokens",
    name: "Output Tokens",
    dataType: "number",
  },
  {
    key: "total_cost",
    name: "Total Cost",
    dataType: "number",
  },
  {
    key: "input_cost",
    name: "Input Cost",
    dataType: "number",
  },
  {
    key: "output_cost",
    name: "Output Cost",
    dataType: "number",
  },
  {
    key: "tags",
    name: "Tags",
    dataType: "string",
  },
];
