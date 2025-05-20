import { TableName, JsonbFieldMapping } from "./types";

export const REPLACE_JSONB_FIELDS: Partial<Record<TableName, Record<string, JsonbFieldMapping>>> = {
  spans: {
    // SELECT string_agg(value::TEXT, '.') FROM jsonb_array_elements_text(spans.attributes->'lmnr.span.path') as path
    path: {
      replaceWith: {
        tableList: [],
        columnList: [
          "select::null::value",
          "select::spans::attributes"
        ],
        ast: {
          with: null,
          type: "select",
          options: null,
          columns: [
            {
              type: "expr",
              expr: {
                type: "aggr_func",
                name: "STRING_AGG",
                args: {
                  distinct: null,
                  expr: {
                    as: null,
                    symbol: "::",
                    target: [
                      {
                        dataType: "TEXT"
                      }
                    ],
                    type: "cast",
                    keyword: "cast",
                    expr: {
                      type: "column_ref",
                      table: null,
                      column: {
                        expr: {
                          type: "default",
                          value: "value"
                        }
                      },
                      collate: null
                    }
                  },
                  orderby: null,
                  separator: {
                    symbol: ",",
                    delimiter: {
                      type: "single_quote_string",
                      value: "."
                    }
                  }
                }
              },
              "as": null
            }
          ],
          into: {
            position: null
          },
          from: [
            {
              prefix: null,
              type: "expr",
              expr: {
                // @ts-ignore
                type: "function",
                name: {
                  name: [
                    {
                      type: "default",
                      value: "jsonb_array_elements_text"
                    }
                  ]
                },
                args: {
                  type: "expr_list",
                  value: [
                    {
                      type: "binary_expr",
                      operator: "->",
                      left: {
                        type: "column_ref",
                        table: "spans",
                        column: {
                          expr: {
                            type: "default",
                            value: "attributes"
                          }
                        },
                        collate: null
                      },
                      right: {
                        type: "single_quote_string",
                        value: "lmnr.span.path"
                      }
                    }
                  ]
                }
              },
              as: null
            }
          ],
          where: null,
          groupby: {
            columns: null,
            modifiers: []
          },
          having: null,
          orderby: null,
          limit: {
            seperator: "",
            value: []
          },
        },
        parentheses: true
      },
      as: "path"
    }
  }
};
