import { AutoJoinRule, ExtendedCast, JsonbFieldMapping, TableName } from "./types";
import { WITH_EVAL_DP_DATA_CTE_NAME, WITH_EVAL_DP_TARGET_CTE_NAME, WITH_EVALUATOR_SCORES_CTE_NAME } from "./with";

export const REPLACE_STATIC_FIELDS: Partial<Record<TableName, Record<string, JsonbFieldMapping>>> = {
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
  },
  // EXTRACT(EPOCH FROM end_time - start_time)
  traces: {
    duration: {
      replaceWith: {
        tableList: [
          "traces"
        ],
        columnList: [
          "select::null::value",
          "select::traces::end_time",
          "select::traces::start_time"
        ],
        ast: {
          type: "extract",
          args: {
            field: "EPOCH",
            cast_type: null,
            source: {
              type: "binary_expr",
              operator: "-",
              left: {
                type: "column_ref",
                table: null,
                column: {
                  expr: {
                    type: "default",
                    value: "end_time"
                  }
                },
                collate: null
              },
              right: {
                type: "column_ref",
                table: null,
                column: {
                  expr: {
                    type: "default",
                    value: "start_time"
                  }
                },
                collate: null
              }
            }
          }
        },
        as: "duration"
      }
    }
  },
};

/**
 * Configuration for automatic JOIN rules
 */
export const AUTO_JOIN_RULES: AutoJoinRule[] = [
  {
    triggerTables: ['spans'] as TableName[],
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
    triggerTables: ['spans'] as TableName[],
    triggerColumns: ['evaluation_name'],
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
        original: 'evaluation_name',
        replacement: {
          table: 'evaluations',
          column: 'name'
        }
      }
    ]
  },
  {
    triggerTables: ['spans'] as TableName[],
    triggerColumns: ['tag'],
    joinChain: [
      {
        leftTable: 'spans',
        leftColumn: 'span_id',
        rightTable: 'labels',
        rightColumn: 'span_id',
      },
      {
        leftTable: 'labels',
        leftColumn: 'class_id',
        rightTable: 'label_classes',
        rightColumn: 'id',
      }
    ],
    columnReplacements: [
      {
        original: 'tag',
        replacement: {
          table: 'label_classes',
          column: 'name'
        }
      }
    ]
  },
  {
    triggerTables: ['traces'] as TableName[],
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
    triggerTables: ['traces'] as TableName[],
    triggerColumns: ['evaluation_name'],
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
        original: 'evaluation_name',
        replacement: {
          table: 'evaluations',
          column: 'name'
        }
      }
    ]
  },
  {
    triggerTables: ['evaluation_results'] as TableName[],
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
  },
  {
    triggerTables: ['evaluation_results'] as TableName[],
    triggerColumns: ['data'],
    joinChain: [
      {
        leftTable: 'evaluation_results',
        leftColumn: 'id',
        rightTable: WITH_EVAL_DP_DATA_CTE_NAME,
        rightColumn: 'id',
      }
    ],
    columnReplacements: [
      {
        original: 'data',
        replacement: {
          table: WITH_EVAL_DP_DATA_CTE_NAME,
          column: 'full_data',
        }
      }
    ]
  },
  {
    triggerTables: ['evaluation_results'] as TableName[],
    triggerColumns: ['target'],
    joinChain: [
      {
        leftTable: 'evaluation_results',
        leftColumn: 'id',
        rightTable: WITH_EVAL_DP_TARGET_CTE_NAME,
        rightColumn: 'id',
      }
    ],
    columnReplacements: [
      {
        original: 'target',
        replacement: {
          table: WITH_EVAL_DP_TARGET_CTE_NAME,
          column: 'target',
        }
      }
    ]
  },
  {
    // Rule to join spans -> evaluator_scores when any column from evaluator_scores is referenced
    triggerTables: ['spans'] as TableName[],
    triggerReferencedTables: [WITH_EVALUATOR_SCORES_CTE_NAME],
    joinChain: [
      {
        leftTable: 'spans',
        leftColumn: 'span_id',
        rightTable: WITH_EVALUATOR_SCORES_CTE_NAME,
        rightColumn: 'span_id'
      }
    ]
  }
];
