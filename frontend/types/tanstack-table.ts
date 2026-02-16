import { type RowData } from "@tanstack/react-table";

// -- tanstack module augmentation --
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    // The raw SQL/ClickHouse expression used in the SELECT clause and as the
    // default ORDER BY expression. Columns without `sql` are excluded from the
    // backend query payload entirely (see `toColumnsPayload` in store.ts).
    sql?: string;
    // Controls how filter values are parsed (number → parseFloat, json → key=value
    // extraction) and which filter UI variant `DataTableFilter` renders.
    dataType?: "string" | "number" | "json" | "datetime";
    // When true, the column appears in the filter dropdown (`DataTableFilter`).
    // Columns with `filterable: false` are omitted from the filter UI completely.
    filterable?: boolean;
    // When true, the column is included in the comparison LEFT JOIN so its value
    // is aliased as `compared:<id>` alongside the primary evaluation's data.
    comparable?: boolean;
    // The ClickHouse type used for parameterized filter bindings in WHERE clauses
    // (e.g. `{param:Int64}`). Defaults to "String" when omitted.
    dbType?: string;
    // An alternative SQL expression used only in WHERE clauses, overriding `sql`.
    // Exists because some columns need different expressions for selection vs
    // filtering (e.g. metadata uses substring for SELECT but JSON extraction for WHERE).
    filterSql?: string;
    // Identifies dynamically-created score columns by name. Used in `score-cell`
    // to look up the correct value (`row["score:<name>"]`) and its comparison
    // counterpart, and to resolve score ranges for heatmap coloring.
    scoreName?: string;
    // When true, the column is excluded from the rendered table (`selectVisibleColumns`)
    // but still sent to the backend — useful for columns like `traceId` or `createdAt`
    // that drive sorting/filtering/row interactions without being user-visible.
    hidden?: boolean;
    // Marks dynamically-created custom columns so components can identify them
    // from columnDefs without reaching into the separate `customColumns` array.
    isCustom?: boolean;
    // The untruncated SQL expression for columns whose SELECT uses substring().
    // Used by DataCell to fetch the full value on hover.
    fullSql?: string;
  }
}
