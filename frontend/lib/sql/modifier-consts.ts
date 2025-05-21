import { AutoJoinRule, ExtendedCast, JsonbFieldMapping, TableName } from "./types";

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
    },
  }
};

/**
 * Configuration for automatic JOIN rules
 */
export const AUTO_JOIN_RULES: AutoJoinRule[] = [
  {
    // Rule to join spans -> evaluation_results -> evaluations when evaluation_id is referenced
    triggerTables: ['spans'],
    triggerColumns: ['evaluation_id'],
    joinChain: [
      {
        leftTable: 'spans',
        leftColumn: 'trace_id',
        rightTable: 'evaluation_results',
        rightColumn: 'trace_id'
      },
      {
        leftTable: 'evaluation_results',
        leftColumn: 'evaluation_id',
        rightTable: 'evaluations',
        rightColumn: 'id'
      }
    ],
    columnReplacements: [
      {
        original: 'evaluation_id',
        replacement: {
          table: 'evaluations',
          column: 'id'
        }
      }
    ]
  },
  {
    // Rule to join traces -> evaluation_results -> evaluations when evaluation_id is referenced
    triggerTables: ['traces'],
    triggerColumns: ['evaluation_id'],
    joinChain: [
      {
        leftTable: 'traces',
        leftColumn: 'id',
        rightTable: 'evaluation_results',
        rightColumn: 'trace_id'
      },
      {
        leftTable: 'evaluation_results',
        leftColumn: 'evaluation_id',
        rightTable: 'evaluations',
        rightColumn: 'id'
      }
    ],
    columnReplacements: [
      {
        original: 'evaluation_id',
        replacement: {
          table: 'evaluations',
          column: 'id'
        }
      }
    ]
  },
  {
    triggerTables: ['evaluation_results'],
    triggerColumns: ['cost', 'duration', 'total_token_count', 'start_time', 'end_time'],
    joinChain: [
      {
        leftTable: 'evaluation_results',
        leftColumn: 'trace_id',
        rightTable: 'traces',
        rightColumn: 'id'
      }
    ],
    columnReplacements: [
      {
        original: 'cost',
        replacement: {
          table: 'traces',
          column: 'cost'
        }
      },
      {
        original: 'duration',
        replacement: {
          type: 'cast',
          as: 'duration',
          keyword: 'cast',
          symbol: '::',
          target: [
            {
              dataType: 'FLOAT',
              length: 8,
              suffix: []
            }
          ],
          expr: {
            type: 'extract',
            args: {
              field: 'EPOCH',
              cast_type: null,
              source: {
                type: 'binary_expr',
                operator: '-',
                left: {
                  type: 'column_ref',
                  table: 'traces',
                  column: 'end_time'
                },
                right: {
                  type: 'column_ref',
                  table: 'traces',
                  column: 'start_time'
                },
                parentheses: true
              }
            }
          }
        } as unknown as ExtendedCast
      },
      {
        original: 'total_token_count',
        replacement: {
          table: 'traces',
          column: 'total_token_count'
        }
      },
      {
        original: 'start_time',
        replacement: {
          table: 'traces',
          column: 'start_time'
        }
      },
      {
        original: 'end_time',
        replacement: {
          table: 'traces',
          column: 'end_time'
        }
      }
    ]
  }
];
