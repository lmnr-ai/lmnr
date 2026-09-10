//! Secure query validation and view-function rewriting for the in-process
//! query engine. Ported from `query-engine/src/query_validator.py`.
//!
//! This is a security boundary: it enforces SELECT-only access, blocks
//! ClickHouse functions that can reach the filesystem / network / other
//! tenants, rejects `project_id` access and unknown table-qualified columns,
//! and rewrites allowed table references to their project-scoped `_v0` view
//! functions.

use std::any::TypeId;
use std::collections::{HashMap, HashSet};
use std::ops::ControlFlow;

use sqlparser::ast::{
    BinaryOperator, Expr, FunctionArg, FunctionArgExpr, FunctionArgOperator, FunctionArguments,
    Ident, JoinOperator, ObjectName, ObjectNamePart, Query, Select, Statement, TableAlias,
    TableFactor, TableFunctionArgs, TableWithJoins, Value, ValueWithSpan, Visit, VisitMut, Visitor,
    VisitorMut,
};
use sqlparser::dialect::{ClickHouseDialect, Dialect, Precedence};
use sqlparser::keywords::Keyword;
use sqlparser::parser::{Parser, ParserError};
use sqlparser::tokenizer::{Span, Token, Tokenizer};

const VIEW_VERSION: &str = "v0";

/// The `traces_v0` view is parameterized by `min_start_time` / `max_start_time`,
/// which narrow the scan before the trace rows are materialized. These bounds are
/// derived from the user's WHERE filters on `start_time` / `end_time` (padded ±3h,
/// see [`START_TIME_PADDING`]); when the query has no time filter on traces, the
/// broad epoch defaults below are used so every trace is visible.
const TRACES_TABLE: &str = "traces";
/// Takes the same start_time bounds plus `eval_ids`, whose empty-array sentinel
/// means "no filter" (see [`eval_ids_arg`]).
const EVALUATION_DATAPOINTS_TABLE: &str = "evaluation_datapoints";
/// 1970-01-01 UTC — the lower default when the query has no lower time bound.
const DEFAULT_MIN_START_TIME: &str = "1970-01-01 00:00:00";
/// 2099-12-31 UTC — the upper default when the query has no upper time bound.
const DEFAULT_MAX_START_TIME: &str = "2099-12-31 00:00:00";
/// Safety pad applied to the derived bounds. Because PREWHERE filters BEFORE
/// FINAL, a newer version of a row could shift its `start_time` in a way that
/// would drop it from a too-tight range; padding by 3h keeps such rows in scope
/// (we prefer underfiltering / a slower query to overfiltering / wrong data).
const START_TIME_PADDING: &str = "INTERVAL 3 HOUR";
/// Date-truncation functions on `start_time` / `end_time` whose argument's day
/// (or larger) bucket we can safely treat as a bound. For `f(start_time) OP x`
/// we treat `x` as a bound on the column value: a `>=`/`>` gives a lower bound,
/// a `<=`/`<` an upper bound, and `=` gives both. The ±3h pad plus the original
/// WHERE (kept intact) absorbs the intra-bucket slack for the sub-day buckets;
/// for day-and-larger buckets we additionally widen the upper `=` bound by the
/// bucket width so a `toStartOfMonth(start_time) = X` still sees the whole month.
fn bucket_width_interval(func: &str) -> Option<&'static str> {
    // Upper-bound widening for an equality on a truncation function: the value
    // is the start of the bucket, so the real upper edge is value + width.
    Some(match func {
        "tostartofminute" => "INTERVAL 1 MINUTE",
        "tostartoffiveminutes" => "INTERVAL 5 MINUTE",
        "tostartoftenminutes" => "INTERVAL 10 MINUTE",
        "tostartoffifteenminutes" => "INTERVAL 15 MINUTE",
        "tostartofhour" => "INTERVAL 1 HOUR",
        "todate" | "tostartofday" => "INTERVAL 1 DAY",
        "tomonday" | "tostartofweek" => "INTERVAL 7 DAY",
        "tostartofmonth" => "INTERVAL 1 MONTH",
        "tostartofquarter" => "INTERVAL 3 MONTH",
        "tostartofyear" => "INTERVAL 1 YEAR",
        _ => return None,
    })
}

/// ClickHouse functions that can access the filesystem, network, or other
/// external resources. Checked against every function call and relation name
/// in the parsed AST to prevent injection via any user-controlled SQL path.
fn blocked_functions() -> &'static HashSet<&'static str> {
    use std::sync::OnceLock;
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| {
        [
            // Filesystem access
            "file",
            "filecluster",
            // Network / remote table access
            "url",
            "urlcluster",
            "remote",
            "remotesecure",
            // S3 / cloud storage. The lakehouse readers (`iceberg*`, `deltaLake*`,
            // `hudi*`, `paimon*`) and `arrowFlight` are prefix-blocked instead —
            // each is a family of ~10 per-backend variants.
            "s3",
            "s3cluster",
            "gcs",
            "oss",
            "cosn",
            "hdfs",
            "hdfscluster",
            "hive",
            "ytsaurus",
            // Other table functions that can read external data
            "jdbc",
            "odbc",
            "mysql",
            "postgresql",
            "mongodb",
            "redis",
            "sqlite",
            "input",
            // Cluster execution
            "cluster",
            "clusterallreplicas",
            // Table functions that read other tables by name/regex, so they
            // sidestep the allowlist. Unreachable from `FROM` (the allowlist
            // rejects the name), but an `ARRAY JOIN` operand skips that check.
            // The list is the `reads a table/dictionary by name` subset of
            // `system.table_functions` (checked on 26.4) — re-derive it from
            // there when bumping ClickHouse. `mergeTree*` is prefix-blocked.
            "merge",
            "loop",
            "dictionary",
            "view",
            "viewifpermitted",
            "viewexplain",
            "prometheusquery",
            "prometheusqueryrange",
            // The TimeSeries-engine readers. Exact-matched, NOT prefixed: 30-odd
            // legitimate scalar/aggregate `timeSeries*` functions share the
            // prefix, and two of them (`timeSeriesTagsToGroup`,
            // `timeSeriesTagsGroupToTags`) even extend `timeseriestags`.
            "timeseriesdata",
            "timeseriestags",
            "timeseriesmetrics",
            "timeseriesselector",
            // Misc dangerous
            "executable",
            "azureblobstorage",
            "azureblobstoragecluster",
            // DoS via server-side delays
            "sleep",
            "sleepeachrow",
            // Dictionary / join-table access (bypasses table validation). The
            // `dictGet*` / `joinGet*` families are also caught by prefix in
            // `is_blocked_function`; the explicit entries document intent.
            "dictget",
            "dictgetordefault",
            "dictgetornull",
            "dicthas",
            "joinget",
            "joingetornull",
            // Server / session info disclosure
            "getsetting",
            "currentdatabase",
            "currentuser",
            "hostname",
            "getmacro",
            // Server memory layout disclosure
            "addresstoline",
            "addresstolinewithinlines",
            "addresstosymbol",
            "demangle",
        ]
        .into_iter()
        .collect()
    })
}

/// Function-name prefixes that cover an entire family of dangerous functions
/// whose typed/suffixed variants would otherwise slip past the exact-match set
/// (e.g. `dictGetString`, `dictGetUInt64`, `dictGetHierarchy`, `dictIsIn`,
/// `joinGetOrNull`). Matched against the lowercased last name part.
///
/// The table-function families are here rather than in `blocked_functions`
/// because each ships ~10 per-backend variants (`icebergS3Cluster`,
/// `deltaLakeAzure`, …) and ClickHouse keeps adding to them — `mergeTree*` alone
/// went from one function to six in three releases. Deliberate collateral: the
/// harmless scalars `mergeTreePartInfo`, `icebergBucket`, `icebergHash` and
/// `icebergTruncate` are blocked too. Do NOT add a `view` prefix here — this is
/// matched against CTE references as well, so it would reject a user CTE named
/// `view_data`.
const BLOCKED_FUNCTION_PREFIXES: &[&str] = &[
    "dictget",
    "dicthas",
    "dictis",
    "joinget",
    "mergetree",
    "iceberg",
    "deltalake",
    "hudi",
    "paimon",
    "arrowflight",
];

/// Returns true if a (lowercased) function / relation name is blocked, by exact
/// match against `blocked_functions` or by dangerous-family prefix. Centralising
/// the decision keeps the relation scanner, expression scanner, and the
/// json_to_sql raw-expression path consistent.
fn is_blocked_function(name: &str) -> bool {
    blocked_functions().contains(name)
        || BLOCKED_FUNCTION_PREFIXES
            .iter()
            .any(|p| name.starts_with(p))
}

/// Scan an expression subtree for any blocked function call (used by the
/// json_to_sql raw-expression validator). Returns the blocked name if found.
pub fn find_blocked_function_in_expr(expr: &Expr) -> Option<String> {
    let mut scan = BlockedScanner { blocked: None };
    let _ = expr.visit(&mut scan);
    scan.blocked
}

/// `ClickHouseDialect` with two upstream `sqlparser` strictnesses relaxed back to
/// what ClickHouse actually accepts:
///
/// 1. **Optional `INTERVAL` unit qualifier.** Upstream
///    `ClickHouseDialect::require_interval_qualifier()` returns `true`, making
///    `Parser::parse_interval` hard-require a temporal-unit keyword after the
///    value, so `INTERVAL '1 day'` (unit inside the string, as ClickHouse and
///    Postgres both accept) errors. Flipping that flag back to the trait default
///    (`false`) makes the parser produce an `Interval` with `leading_field:
///    None`, which round-trips verbatim — the unit token can't be synthesized at
///    the token level because `Interval`'s `Display` would then append it
///    (`INTERVAL '1 day' SECOND`) and corrupt the SQL sent to ClickHouse.
///    Upstream issue: https://github.com/apache/datafusion-sqlparser-rs/issues/2390
///
/// 2. **Unparenthesized single-expression `IN` RHS.** Upstream `Parser::parse_in`
///    hard-requires a `(` after `IN` and rejects a bare right operand, but
///    ClickHouse accepts any single expression there (`col IN 5`, `col IN
///    {ids:Array(UUID)}`, `col IN power(2,3)`, `x IN INTERVAL 1 day`) — it
///    type-casts both sides to a supertype and wraps a singular value in a tuple
///    (https://clickhouse.com/docs/sql-reference/operators/in). The `parse_infix`
///    override below parses such a bare RHS with the real expression parser.
///    Upstream issue: https://github.com/apache/datafusion-sqlparser-rs/issues/2384
///
/// Every other `Dialect` method delegates to the wrapped `ClickHouseDialect`, so
/// this is ClickHouse parsing in every respect except those two relaxations.
/// Workaround for upstream over-strict checks; drop this wrapper (parse with
/// `ClickHouseDialect` directly) once both are fixed upstream. NOTE: the
/// delegation list mirrors `ClickHouseDialect`'s overrides for the pinned
/// sqlparser version — re-check it when bumping the crate.
#[derive(Debug, Default, Clone, Copy)]
struct ClickHouseOptionalIntervalDialect(ClickHouseDialect);

impl Dialect for ClickHouseOptionalIntervalDialect {
    // Report ClickHouseDialect's identity so `dialect_of!(self is
    // ClickHouseDialect)` checks inside the parser (e.g. parametric aggregate
    // functions `quantile(0.9)(duration)`) still take the ClickHouse path. The
    // `Dialect::dialect()` override is the upstream-blessed way to wrap a
    // dialect without losing its type identity.
    fn dialect(&self) -> TypeId {
        self.0.dialect()
    }

    // Make the interval unit qualifier optional (relaxation #1).
    fn require_interval_qualifier(&self) -> bool {
        false
    }

    // Accept a bare single-expression `IN` / `NOT IN` right operand (relaxation
    // #2). `parse_infix` is consulted BEFORE the operator is consumed, so we peek
    // for `NOT? IN <not-'('-and-not-UNNEST>`. A `(` or `UNNEST` after `IN` means
    // a list / subquery / empty-list / `IN UNNEST(...)`, which stock `parse_in`
    // already handles — return `None` so the parser takes its default path. Any
    // other infix also returns `None`, leaving all other parsing untouched.
    fn parse_infix(
        &self,
        parser: &mut Parser,
        expr: &Expr,
        _precedence: u8,
    ) -> Option<Result<Expr, ParserError>> {
        let is_in = |t: &Token| matches!(t, Token::Word(w) if w.keyword == Keyword::IN);
        let is_not = |t: &Token| matches!(t, Token::Word(w) if w.keyword == Keyword::NOT);

        // Locate the `IN` keyword and the token immediately after it, honoring an
        // optional leading `NOT`. (peek_* skip whitespace.)
        let (negated, after_in) =
            if is_not(&parser.peek_token().token) && is_in(&parser.peek_nth_token(1).token) {
                (true, parser.peek_nth_token(2).token)
            } else if is_in(&parser.peek_token().token) {
                (false, parser.peek_nth_token(1).token)
            } else {
                return None;
            };

        // Parenthesized list / subquery / empty list / `IN UNNEST(...)` — let the
        // stock `parse_in` handle these unchanged.
        if matches!(after_in, Token::LParen)
            || matches!(&after_in, Token::Word(w) if w.keyword == Keyword::UNNEST)
        {
            return None;
        }

        // Bare single-expression RHS: consume `NOT? IN`, then parse one expression
        // at BETWEEN precedence (the same bound `parse_between` uses) so a trailing
        // `AND` / `OR` / comma is NOT swallowed into the RHS.
        Some((|| {
            if negated {
                parser.expect_keyword(Keyword::NOT)?;
            }
            parser.expect_keyword(Keyword::IN)?;
            let rhs = parser.parse_subexpr(self.0.prec_value(Precedence::Between))?;
            Ok(Expr::InList {
                expr: Box::new(expr.clone()),
                list: vec![rhs],
                negated,
            })
        })())
    }

    // Everything else forwards verbatim to ClickHouseDialect.
    fn is_identifier_start(&self, ch: char) -> bool {
        self.0.is_identifier_start(ch)
    }
    fn is_identifier_part(&self, ch: char) -> bool {
        self.0.is_identifier_part(ch)
    }
    fn supports_string_literal_backslash_escape(&self) -> bool {
        self.0.supports_string_literal_backslash_escape()
    }
    fn supports_select_wildcard_except(&self) -> bool {
        self.0.supports_select_wildcard_except()
    }
    fn describe_requires_table_keyword(&self) -> bool {
        self.0.describe_requires_table_keyword()
    }
    fn supports_limit_comma(&self) -> bool {
        self.0.supports_limit_comma()
    }
    fn supports_insert_table_function(&self) -> bool {
        self.0.supports_insert_table_function()
    }
    fn supports_insert_format(&self) -> bool {
        self.0.supports_insert_format()
    }
    fn supports_numeric_literal_underscores(&self) -> bool {
        self.0.supports_numeric_literal_underscores()
    }
    fn supports_partition_by_after_order_by(&self) -> bool {
        self.0.supports_partition_by_after_order_by()
    }
    fn supports_array_join_syntax(&self) -> bool {
        self.0.supports_array_join_syntax()
    }
    fn supports_dictionary_syntax(&self) -> bool {
        self.0.supports_dictionary_syntax()
    }
    fn supports_lambda_functions(&self) -> bool {
        self.0.supports_lambda_functions()
    }
    fn supports_from_first_select(&self) -> bool {
        self.0.supports_from_first_select()
    }
    fn supports_order_by_all(&self) -> bool {
        self.0.supports_order_by_all()
    }
    fn supports_group_by_expr(&self) -> bool {
        self.0.supports_group_by_expr()
    }
    fn supports_group_by_with_modifier(&self) -> bool {
        self.0.supports_group_by_with_modifier()
    }
    fn supports_nested_comments(&self) -> bool {
        self.0.supports_nested_comments()
    }
    fn supports_optimize_table(&self) -> bool {
        self.0.supports_optimize_table()
    }
    fn supports_prewhere(&self) -> bool {
        self.0.supports_prewhere()
    }
    fn supports_with_fill(&self) -> bool {
        self.0.supports_with_fill()
    }
    fn supports_limit_by(&self) -> bool {
        self.0.supports_limit_by()
    }
    fn supports_interpolate(&self) -> bool {
        self.0.supports_interpolate()
    }
    fn supports_settings(&self) -> bool {
        self.0.supports_settings()
    }
    fn supports_select_format(&self) -> bool {
        self.0.supports_select_format()
    }
    fn supports_select_wildcard_replace(&self) -> bool {
        self.0.supports_select_wildcard_replace()
    }
    fn supports_comma_separated_trim(&self) -> bool {
        self.0.supports_comma_separated_trim()
    }
}

pub(crate) fn parse_clickhouse_sql(sql: &str) -> Result<Vec<Statement>, ParserError> {
    let dialect = ClickHouseOptionalIntervalDialect::default();
    // Tokenize WITH locations: the validator later identifies ARRAY JOIN array
    // columns by their source span, so spans must survive into the parsed AST.
    let tokens = Tokenizer::new(&dialect, sql).tokenize_with_location()?;
    Parser::new(&dialect)
        .with_tokens_with_locations(tokens)
        .parse_statements()
}

/// Parse a single scalar expression with the same ClickHouse dialect used for
/// statements. Used to build the `min_start_time` / `max_start_time` bound
/// arguments injected into the `traces_v0(...)` view function.
fn parse_ch_expr(sql: &str) -> Result<Expr, ParserError> {
    let dialect = ClickHouseOptionalIntervalDialect::default();
    let tokens = Tokenizer::new(&dialect, sql).tokenize_with_location()?;
    Parser::new(&dialect)
        .with_tokens_with_locations(tokens)
        .parse_expr()
}

#[derive(Debug, Clone)]
pub struct TableSchema {
    pub allowed_columns: HashSet<&'static str>,
}

impl TableSchema {
    fn is_column_allowed(&self, column: &str) -> bool {
        let lower = column.to_lowercase();
        self.allowed_columns
            .iter()
            .any(|c| c.to_lowercase() == lower)
    }
}

#[derive(Clone)]
pub struct TableRegistry {
    tables: HashMap<&'static str, TableSchema>,
}

impl Default for TableRegistry {
    fn default() -> Self {
        Self::new()
    }
}

fn schema(cols: &[&'static str]) -> TableSchema {
    TableSchema {
        allowed_columns: cols.iter().copied().collect(),
    }
}

impl TableRegistry {
    pub fn new() -> Self {
        let mut tables: HashMap<&'static str, TableSchema> = HashMap::new();

        let spans_columns = [
            "span_id",
            "status",
            "name",
            "path",
            "parent_span_id",
            "span_type",
            "start_time",
            "end_time",
            "duration",
            "input",
            "output",
            "request_model",
            "response_model",
            "model",
            "provider",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
            "reasoning_tokens",
            "input_cost",
            "output_cost",
            "total_cost",
            "attributes",
            "trace_id",
            "tags",
            "tool_definitions",
            "events",
        ];

        let traces_columns = [
            "id",
            "trace_type",
            "metadata",
            "start_time",
            "end_time",
            "duration",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
            "reasoning_tokens",
            "input_cost",
            "output_cost",
            "total_cost",
            "status",
            "user_id",
            "session_id",
            "top_span_id",
            "top_span_name",
            "top_span_type",
            "tags",
            "trace_tags",
            "span_names",
            "agent_input",
            "internal_metadata",
            "has_browser_session",
        ];

        // Extracted agent outputs live in their own view (`trace_outputs_v0`,
        // backed by the `trace_agent_output` RMT): the dict-resolving join was
        // too expensive to keep inside the hot traces view. `agent_output` is
        // the winning span's full output-message array (Array(String), one raw
        // message JSON per element).
        // The time column is `start_time` (the owning trace's), NOT `updated_at`.
        // Listing `updated_at` let a table-qualified reference pass validation and
        // then fail in ClickHouse, while the real `start_time` was rejected here.
        let trace_outputs_columns = ["trace_id", "start_time", "agent_output"];

        let dataset_datapoints_columns = [
            "id",
            "created_at",
            "dataset_id",
            "data",
            "target",
            "metadata",
        ];

        let signal_runs_columns = [
            "project_id",
            "signal_id",
            "job_id",
            "trigger_id",
            "trace_id",
            "run_id",
            "status",
            "event_id",
            "error_message",
            "mode",
            "updated_at",
            "input_tokens",
            "cache_read_tokens",
            "output_tokens",
        ];

        let signal_events_columns = [
            "id",
            "project_id",
            "signal_id",
            "trace_id",
            "run_id",
            "name",
            "payload",
            "timestamp",
            "severity",
            "summary",
            "clusters",
        ];

        let logs_columns = [
            "log_id",
            "project_id",
            "time",
            "observed_time",
            "severity_number",
            "severity_text",
            "body",
            "attributes",
            "trace_id",
            "span_id",
            "flags",
            "event_name",
        ];

        let labeling_queue_items_columns = [
            "id",
            "queue_id",
            "payload",
            "metadata",
            "status",
            "edit",
            "created_at",
            "updated_at",
        ];

        let evaluation_datapoints_columns = [
            "id",
            "evaluation_id",
            "data",
            "target",
            "metadata",
            "executor_output",
            "index",
            "trace_id",
            "group_id",
            "scores",
            "updated_at",
            "created_at",
            "dataset_id",
            "dataset_datapoint_id",
            "dataset_datapoint_created_at",
            "duration",
            "input_cost",
            "output_cost",
            "total_cost",
            "start_time",
            "end_time",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "trace_status",
            "trace_metadata",
            "trace_tags",
            "top_span_id",
            "trace_spans",
        ];

        let clusters_columns = [
            "id",
            "signal_id",
            "name",
            "level",
            "parent_id",
            "num_signal_events",
            "num_children_clusters",
            "created_at",
            "updated_at",
        ];

        let event_clusters_all_columns = [
            "event_id",
            "cluster_id",
            "signal_id",
            "level",
            "cluster_name",
            "parent_id",
            "num_signal_events",
            "num_children_clusters",
            "created_at",
            "updated_at",
        ];

        tables.insert("spans", schema(&spans_columns));
        tables.insert("traces", schema(&traces_columns));
        tables.insert("trace_outputs", schema(&trace_outputs_columns));
        tables.insert("dataset_datapoints", schema(&dataset_datapoints_columns));
        // same columns as dataset_datapoints, but the _v0 view only exposes the
        // latest version of each datapoint
        tables.insert(
            "dataset_datapoint_versions",
            schema(&dataset_datapoints_columns),
        );
        tables.insert(
            "evaluation_datapoints",
            schema(&evaluation_datapoints_columns),
        );
        tables.insert("signal_runs", schema(&signal_runs_columns));
        tables.insert("signal_events", schema(&signal_events_columns));
        tables.insert("logs", schema(&logs_columns));
        tables.insert(
            "labeling_queue_items",
            schema(&labeling_queue_items_columns),
        );
        tables.insert("clusters", schema(&clusters_columns));
        // L0-inclusive variants
        tables.insert("signal_events_all", schema(&signal_events_columns));
        tables.insert("event_clusters_all", schema(&event_clusters_all_columns));

        Self { tables }
    }

    pub fn is_table_allowed(&self, table_name: &str) -> bool {
        self.tables.contains_key(table_name.to_lowercase().as_str())
    }

    pub fn get_table_schema(&self, table_name: &str) -> Option<&TableSchema> {
        self.tables.get(table_name.to_lowercase().as_str())
    }
}

#[derive(Clone)]
pub struct QueryValidator {
    registry: TableRegistry,
}

impl Default for QueryValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl QueryValidator {
    pub fn new() -> Self {
        Self {
            registry: TableRegistry::new(),
        }
    }

    /// Validates and secures a SQL query using virtual views. Returns the
    /// rewritten query or an error message describing why it was rejected.
    pub fn validate_and_secure_query(
        &self,
        sql_query: &str,
        project_id: &str,
    ) -> Result<String, String> {
        let mut statements =
            parse_clickhouse_sql(sql_query).map_err(|e| format!("Query validation failed: {e}"))?;

        if statements.len() != 1 {
            return Err("Only SELECT statements are allowed".to_string());
        }
        let mut statement = statements.remove(0);

        self.validate_security(&statement)?;
        // Reject CTEs that shadow an allowlisted physical table. CTE-name
        // collection (`collect_cte_names`) is global, not lexically scoped, so a
        // CTE named `spans` defined in an inner scope would otherwise make the
        // rewriter skip an outer `FROM spans` (the real physical table) — a
        // cross-tenant leak. Forbidding the collision keeps the invariant
        // "allowlisted name ⇒ always a physical table ⇒ always rewritten".
        self.validate_cte_names(&statement)?;

        // ARRAY JOIN right-hand sides are array columns or expressions over
        // them, not table references — identified by source span so the passes
        // below can skip them instead of rewriting them into `_v0(...)`. The
        // rewriter leaves these nodes intact, so the same spans stay valid for
        // the post-rewrite check; compute once. Only operands proven not to be
        // tables are recorded; anything else is rejected here. Runs after
        // `validate_cte_names` because it relies on that invariant.
        let array_join_operands = collect_array_join_operands(&statement, &self.registry)?;

        self.validate_tables_and_columns(&statement, &array_join_operands)?;

        let cte_names = collect_cte_names(&statement);
        let mut rewriter = ViewRewriter {
            registry: &self.registry,
            project_id,
            cte_names,
            array_join_operands: &array_join_operands,
            where_stack: Vec::new(),
            error: None,
        };
        let _ = VisitMut::visit(&mut statement, &mut rewriter);
        if let Some(e) = rewriter.error {
            return Err(e);
        }

        strip_settings(&mut statement);

        // Defense-in-depth: after rewriting, no allowlisted physical table may
        // survive as a bare relation (every one must now be a `_v0(...)` view
        // function), and no blocked function may have been introduced. A
        // violation means a rewrite escape — fail closed rather than ship
        // unscoped SQL to ClickHouse.
        self.validate_post_rewrite(&statement, &array_join_operands)?;

        Ok(statement.to_string())
    }

    /// Reject any CTE whose name collides with an allowlisted physical table.
    fn validate_cte_names(&self, statement: &Statement) -> Result<(), String> {
        for name in collect_cte_names(statement) {
            if self.registry.is_table_allowed(&name) {
                return Err(format!(
                    "CTE name '{name}' collides with a protected table name"
                ));
            }
        }
        Ok(())
    }

    /// Re-scan the rewritten statement: assert every allowlisted physical table
    /// reference was rewritten away and no blocked function was introduced.
    /// `ARRAY JOIN` array columns are exempt — those relations are
    /// intentionally left un-rewritten (they aren't tables).
    fn validate_post_rewrite(
        &self,
        statement: &Statement,
        array_join_operands: &HashSet<Span>,
    ) -> Result<(), String> {
        let mut scan = BlockedScanner { blocked: None };
        let _ = statement.visit(&mut scan);
        if let Some(name) = scan.blocked {
            return Err(format!("Function '{name}' is not allowed"));
        }

        let mut checker = PostRewriteChecker {
            registry: &self.registry,
            array_join_operands,
            error: None,
        };
        let _ = statement.visit(&mut checker);
        if let Some(e) = checker.error {
            return Err(e);
        }
        Ok(())
    }

    fn validate_security(&self, statement: &Statement) -> Result<(), String> {
        // Only SELECT statements are allowed.
        match statement {
            Statement::Query(_) => {}
            _ => return Err("Only SELECT statements are allowed".to_string()),
        }

        // Block dangerous functions / table functions that can access external
        // resources. They appear either as call expressions or as relation
        // names (table functions like remote / s3 / mysql).
        let mut scan = BlockedScanner { blocked: None };
        let _ = statement.visit(&mut scan);
        if let Some(name) = scan.blocked {
            return Err(format!("Function '{name}' is not allowed"));
        }

        Ok(())
    }

    fn validate_tables_and_columns(
        &self,
        statement: &Statement,
        array_join_operands: &HashSet<Span>,
    ) -> Result<(), String> {
        let cte_names = collect_cte_names(statement);
        let mut checker = TableColumnChecker {
            registry: &self.registry,
            cte_names: &cte_names,
            array_join_operands,
            error: None,
        };
        let _ = statement.visit(&mut checker);
        if let Some(e) = checker.error {
            return Err(e);
        }
        Ok(())
    }
}

/// Lowercased last identifier of a relation name (matches sqlglot `Table.name`).
fn relation_table_name(name: &ObjectName) -> String {
    name.0
        .last()
        .map(object_name_part_ident)
        .unwrap_or_default()
        .to_lowercase()
}

fn object_name_part_ident(part: &ObjectNamePart) -> String {
    match part {
        ObjectNamePart::Identifier(ident) => ident.value.clone(),
        other => other.to_string(),
    }
}

/// Collect all CTE alias names (across every `WITH` clause) lowercased.
fn collect_cte_names(statement: &Statement) -> HashSet<String> {
    struct CteCollector {
        names: HashSet<String>,
    }
    impl Visitor for CteCollector {
        type Break = ();
        fn pre_visit_query(&mut self, query: &Query) -> ControlFlow<()> {
            if let Some(with) = &query.with {
                for cte in &with.cte_tables {
                    self.names.insert(cte.alias.name.value.to_lowercase());
                }
            }
            ControlFlow::Continue(())
        }
    }
    let mut c = CteCollector {
        names: HashSet::new(),
    };
    let _ = statement.visit(&mut c);
    c.names
}

/// Source-span of an `ObjectName`'s last identifier, used to uniquely identify a
/// particular relation occurrence in the original SQL (two textually identical
/// names at different positions have different spans).
///
/// `Span::empty()` is rejected: it means "no source location", which identifies
/// nothing. Idents synthesized rather than parsed carry it — including the
/// `_v0` view names [`ViewRewriter`] builds — so treating it as a real span
/// would let one exempted operand exempt every synthesized relation too.
fn relation_name_span(name: &ObjectName) -> Option<Span> {
    match name.0.last()? {
        ObjectNamePart::Identifier(ident) if ident.span != Span::empty() => Some(ident.span),
        _ => None,
    }
}

fn is_array_join(op: &JoinOperator) -> bool {
    matches!(
        op,
        JoinOperator::ArrayJoin | JoinOperator::LeftArrayJoin | JoinOperator::InnerArrayJoin
    )
}

/// Rejection message for an `ARRAY JOIN` right-hand side that can be neither an
/// array column nor an expression over one (`UNNEST(...)`, a nested join, a
/// three-part name).
const ARRAY_JOIN_NOT_A_COLUMN: &str =
    "ARRAY JOIN must reference an array column or an expression over one";

/// A relation an `ARRAY JOIN` in the same `FROM` item can draw its array column
/// from: the left-most relation plus anything attached by a regular join.
struct ScopeRelation<'a> {
    /// What a column qualifier has to say to address it — the alias, or the bare
    /// table name when unaliased. `None` for an unaliased subquery, which no
    /// qualifier can name.
    name: Option<String>,
    /// `None` when the column set is unknown (a CTE or a subquery).
    schema: Option<&'a TableSchema>,
}

fn array_join_scope<'a>(
    twj: &TableWithJoins,
    registry: &'a TableRegistry,
) -> Vec<ScopeRelation<'a>> {
    let relations = std::iter::once(&twj.relation).chain(
        twj.joins
            .iter()
            .filter(|j| !is_array_join(&j.join_operator))
            .map(|j| &j.relation),
    );

    relations
        .map(|relation| match relation {
            TableFactor::Table {
                name, alias, args, ..
            } => {
                let table = relation_table_name(name);
                ScopeRelation {
                    name: Some(
                        alias
                            .as_ref()
                            .map_or_else(|| table.clone(), |a| a.name.value.to_lowercase()),
                    ),
                    // A name that is not allowlisted is a CTE reference — an unknown
                    // table is rejected later by `TableColumnChecker`, and
                    // `validate_cte_names` has already refused any CTE that shadows
                    // an allowlisted name. Either way its columns are not knowable.
                    schema: args
                        .is_none()
                        .then(|| registry.get_table_schema(&table))
                        .flatten(),
                }
            }
            TableFactor::Derived { alias, .. } | TableFactor::NestedJoin { alias, .. } => {
                ScopeRelation {
                    name: alias.as_ref().map(|a| a.name.value.to_lowercase()),
                    schema: None,
                }
            }
            _ => ScopeRelation {
                name: None,
                schema: None,
            },
        })
        .collect()
}

/// Establish that `column`, optionally qualified, is a column of a relation in
/// `scope`. `Err` carries the message the query is rejected with.
fn resolve_array_join_column(
    scope: &[ScopeRelation<'_>],
    qualifier: Option<&str>,
    column: &str,
    registry: &TableRegistry,
) -> Result<(), String> {
    // Unqualified, every relation in the `FROM` item can supply the column;
    // qualified, only the one the qualifier names.
    let candidates: Vec<_> = scope
        .iter()
        .filter(|r| qualifier.is_none_or(|q| r.name.as_deref() == Some(q)))
        .collect();

    // Nothing in the FROM clause answers to the qualifier, so the name is a
    // database-qualified table (`default.spans`) rather than a column.
    if let Some(qualifier) = qualifier
        && candidates.is_empty()
    {
        return Err(format!(
            "ARRAY JOIN qualifier '{qualifier}' does not name a relation in this FROM clause"
        ));
    }

    let known = |r: &&ScopeRelation| r.schema.is_some_and(|s| s.is_column_allowed(column));
    // A CTE or subquery has no knowable column set, so any identifier is
    // plausible — but never an allowlisted table name, which
    // `FROM cte ARRAY JOIN spans` would otherwise ship to ClickHouse unscoped.
    let opaque = |r: &&ScopeRelation| r.schema.is_none() && !registry.is_table_allowed(column);

    if candidates.iter().any(known) || candidates.iter().any(opaque) {
        Ok(())
    } else {
        Err(format!("Column '{column}' does not exist"))
    }
}

/// Is this relation a recorded `ARRAY JOIN` right-hand side? Callers that
/// rewrite must additionally require `args.is_none()`: a bare name there is an
/// array column and must survive verbatim, but a function call is an ordinary
/// expression that only has to be hidden from the *table allowlist*.
fn is_array_join_operand(operands: &HashSet<Span>, name: &ObjectName) -> bool {
    relation_name_span(name).is_some_and(|s| operands.contains(&s))
}

/// Collect the source spans of every relation that is the right-hand side of a
/// ClickHouse `ARRAY JOIN`. In `... ARRAY JOIN clusters AS cluster_id`, `clusters`
/// is an **array column** of the left table, not a table reference — `sqlparser`
/// nonetheless models it as a `TableFactor::Table`. We key by span so the
/// table/column visitors can recognise and skip exactly that occurrence without
/// affecting a genuine `FROM clusters` elsewhere in the query.
///
/// A recorded bare name is skipped by all three passes: it is neither checked
/// against the table allowlist nor rewritten into its `_v0` view. That is only
/// sound for an identifier positively established to be a column of a relation
/// in scope — anything else would reach ClickHouse verbatim and unscoped. Names
/// that cannot be proven to be columns are therefore rejected here rather than
/// skipped.
fn collect_array_join_operands(
    statement: &Statement,
    registry: &TableRegistry,
) -> Result<HashSet<Span>, String> {
    struct ArrayJoinCollector<'a> {
        registry: &'a TableRegistry,
        operands: HashSet<Span>,
        error: Option<String>,
    }

    impl ArrayJoinCollector<'_> {
        fn record(
            &mut self,
            scope: &[ScopeRelation<'_>],
            relation: &TableFactor,
        ) -> Result<(), String> {
            let TableFactor::Table { name, args, .. } = relation else {
                // A subquery right-hand side is a genuine relation, so it must
                // stay visible to the rewriter rather than be exempted.
                return match relation {
                    TableFactor::Derived { .. } => Ok(()),
                    _ => Err(ARRAY_JOIN_NOT_A_COLUMN.to_string()),
                };
            };
            let Some(span) = relation_name_span(name) else {
                return Err(ARRAY_JOIN_NOT_A_COLUMN.to_string());
            };
            let qualifier = match name.0.as_slice() {
                [_] => None,
                [qualifier, _] => Some(object_name_part_ident(qualifier).to_lowercase()),
                // `a.b.c` cannot be a column reference.
                _ => return Err(ARRAY_JOIN_NOT_A_COLUMN.to_string()),
            };

            // A function call is an expression over the row's columns, not a
            // relation, so there is no column to resolve. Recording it hides the
            // function name from the table allowlist and nothing else — the
            // rewriter still visits it (see `is_array_join_operand`), which is
            // what keeps `spans(1)` rejected and still scopes any table inside
            // the arguments.
            if args.is_some() {
                if qualifier.is_some() {
                    return Err(ARRAY_JOIN_NOT_A_COLUMN.to_string());
                }
            } else {
                resolve_array_join_column(
                    scope,
                    qualifier.as_deref(),
                    &relation_table_name(name),
                    self.registry,
                )?;
            }
            self.operands.insert(span);
            Ok(())
        }
    }

    impl Visitor for ArrayJoinCollector<'_> {
        type Break = ();
        fn pre_visit_select(&mut self, select: &Select) -> ControlFlow<()> {
            for twj in &select.from {
                if !twj.joins.iter().any(|j| is_array_join(&j.join_operator)) {
                    continue;
                }
                let scope = array_join_scope(twj, self.registry);
                for join in &twj.joins {
                    if !is_array_join(&join.join_operator) {
                        continue;
                    }
                    if let Err(e) = self.record(&scope, &join.relation) {
                        self.error = Some(e);
                        return ControlFlow::Break(());
                    }
                }
            }
            ControlFlow::Continue(())
        }
    }

    let mut c = ArrayJoinCollector {
        registry,
        operands: HashSet::new(),
        error: None,
    };
    let _ = statement.visit(&mut c);
    match c.error {
        Some(e) => Err(e),
        None => Ok(c.operands),
    }
}

struct BlockedScanner {
    blocked: Option<String>,
}

impl Visitor for BlockedScanner {
    type Break = ();

    fn pre_visit_expr(&mut self, expr: &Expr) -> ControlFlow<()> {
        if let Expr::Function(f) = expr {
            let name = relation_table_name(&f.name);
            if is_blocked_function(&name) {
                self.blocked = Some(name);
                return ControlFlow::Break(());
            }
        }
        ControlFlow::Continue(())
    }

    fn pre_visit_relation(&mut self, name: &ObjectName) -> ControlFlow<()> {
        let table = relation_table_name(name);
        if is_blocked_function(&table) {
            self.blocked = Some(table);
            return ControlFlow::Break(());
        }
        ControlFlow::Continue(())
    }
}

struct TableColumnChecker<'a> {
    registry: &'a TableRegistry,
    cte_names: &'a HashSet<String>,
    array_join_operands: &'a HashSet<Span>,
    error: Option<String>,
}

impl Visitor for TableColumnChecker<'_> {
    type Break = ();

    fn pre_visit_relation(&mut self, name: &ObjectName) -> ControlFlow<()> {
        // An ARRAY JOIN right-hand side is an array column of a relation in
        // scope, or a function over one — either way not a table reference, so
        // don't validate its name against the table allowlist.
        if is_array_join_operand(self.array_join_operands, name) {
            return ControlFlow::Continue(());
        }
        let table = relation_table_name(name);
        if self.cte_names.contains(&table) {
            return ControlFlow::Continue(());
        }
        if !self.registry.is_table_allowed(&table) {
            self.error = Some(format!("Table '{table}' is not allowed"));
            return ControlFlow::Break(());
        }
        ControlFlow::Continue(())
    }

    fn pre_visit_expr(&mut self, expr: &Expr) -> ControlFlow<()> {
        let (qualifier, column) = match expr {
            Expr::Identifier(ident) => (None, ident.value.clone()),
            Expr::CompoundIdentifier(parts) if !parts.is_empty() => {
                let column = parts.last().unwrap().value.clone();
                let qualifier = if parts.len() >= 2 {
                    Some(parts[parts.len() - 2].value.clone())
                } else {
                    None
                };
                (qualifier, column)
            }
            _ => return ControlFlow::Continue(()),
        };

        if column.is_empty() {
            return ControlFlow::Continue(());
        }

        // project_id is never allowed in user queries.
        if column.to_lowercase() == "project_id" {
            self.error = Some("Column 'project_id' does not exist".to_string());
            return ControlFlow::Break(());
        }

        // If the column has a table qualifier that resolves to a known table,
        // validate it against that table's schema.
        if let Some(qualifier) = qualifier {
            if let Some(schema) = self.registry.get_table_schema(&qualifier) {
                if !schema.is_column_allowed(&column) {
                    self.error = Some(format!("Column '{column}' does not exist"));
                    return ControlFlow::Break(());
                }
            }
        }

        ControlFlow::Continue(())
    }
}

/// Post-rewrite verifier: every allowlisted physical table must have been
/// rewritten into a `_v0(...)` view function, so no bare allowlisted relation
/// (one without table-function args) may remain.
struct PostRewriteChecker<'a> {
    registry: &'a TableRegistry,
    array_join_operands: &'a HashSet<Span>,
    error: Option<String>,
}

impl Visitor for PostRewriteChecker<'_> {
    type Break = ();

    fn pre_visit_table_factor(&mut self, table_factor: &TableFactor) -> ControlFlow<()> {
        if let TableFactor::Table { name, args, .. } = table_factor {
            // ARRAY JOIN array columns are intentionally left un-rewritten; they
            // aren't tables, so don't flag them as "not project-scoped".
            if args.is_none() && is_array_join_operand(self.array_join_operands, name) {
                return ControlFlow::Continue(());
            }
            // A view function (`spans_v0(...)`) carries args; a bare allowlisted
            // relation does not. The latter escaped rewriting — fail closed.
            if args.is_none() {
                let table = relation_table_name(name);
                if self.registry.is_table_allowed(&table) {
                    self.error = Some(format!(
                        "Internal validation error: table '{table}' was not project-scoped"
                    ));
                    return ControlFlow::Break(());
                }
            }
        }
        ControlFlow::Continue(())
    }
}

struct ViewRewriter<'a> {
    registry: &'a TableRegistry,
    project_id: &'a str,
    cte_names: HashSet<String>,
    array_join_operands: &'a HashSet<Span>,
    where_stack: Vec<Option<Expr>>,
    error: Option<String>,
}

impl VisitorMut for ViewRewriter<'_> {
    type Break = ();

    fn pre_visit_select(&mut self, select: &mut Select) -> ControlFlow<()> {
        self.where_stack.push(select.selection.clone());
        ControlFlow::Continue(())
    }

    fn post_visit_select(&mut self, _select: &mut Select) -> ControlFlow<()> {
        self.where_stack.pop();
        ControlFlow::Continue(())
    }

    fn pre_visit_table_factor(&mut self, table_factor: &mut TableFactor) -> ControlFlow<()> {
        if let TableFactor::Table {
            name, alias, args, ..
        } = table_factor
        {
            // An ARRAY JOIN array column is not a table reference — leave it
            // exactly as written. (sqlparser models it as a
            // `TableFactor::Table`, so without this guard we'd rewrite e.g.
            // `ARRAY JOIN clusters` into `clusters_v0(...)`.) A function operand
            // deliberately falls through instead: that is what keeps
            // `ARRAY JOIN spans(1)` rejected below.
            if args.is_none() && is_array_join_operand(self.array_join_operands, name) {
                return ControlFlow::Continue(());
            }

            let table_name = relation_table_name(name);

            // An allowlisted table name presented as a table function (e.g.
            // `FROM spans(...)`) must not slip through unrewritten — reject it
            // rather than leave a bare, unscoped relation behind.
            if args.is_some() {
                if !self.cte_names.contains(&table_name)
                    && self.registry.is_table_allowed(&table_name)
                {
                    self.error = Some(format!(
                        "Table '{table_name}' cannot be used as a table function"
                    ));
                    return ControlFlow::Break(());
                }
                // Don't rewrite something that is already a table function.
                return ControlFlow::Continue(());
            }

            // Skip CTE references and non-allowlisted tables (the latter is
            // rejected earlier in validation; here we just leave them alone).
            if self.cte_names.contains(&table_name) || !self.registry.is_table_allowed(&table_name)
            {
                return ControlFlow::Continue(());
            }

            let view_name = format!("{table_name}_{VIEW_VERSION}");
            let alias_ident = alias
                .as_ref()
                .map(|a| a.name.clone())
                .unwrap_or_else(|| Ident::new(table_name.clone()));

            *name = ObjectName(vec![ObjectNamePart::Identifier(Ident::new(view_name))]);
            let mut view_args = vec![named_arg("project_id", string_expr(self.project_id))];
            // `traces_v0` and `evaluation_datapoints_v0` are parameterized by
            // start_time bounds; derive them from the enclosing WHERE so the view
            // narrows its scan. Columns are matched against this relation's alias
            // (or the bare table name) so a joined table's `start_time` is not
            // confused for the traces one. `where_stack` only ever carries the
            // enclosing SELECT's WHERE (see `pre_visit_select`), so
            // post-aggregation HAVING predicates are intentionally excluded —
            // they can't be pushed to a pre-scan PREWHERE anyway.
            if table_name == TRACES_TABLE {
                let where_clause = self.where_stack.last().and_then(|w| w.as_ref());
                let (min_expr, max_expr) = traces_time_bound_args(where_clause, &alias_ident.value);
                view_args.push(named_arg("min_start_time", min_expr));
                view_args.push(named_arg("max_start_time", max_expr));
            } else if table_name == EVALUATION_DATAPOINTS_TABLE {
                // Same bounds derivation as traces — the view exposes the trace's
                // `start_time`.
                let where_clause = self.where_stack.last().and_then(|w| w.as_ref());
                let (min_expr, max_expr) = traces_time_bound_args(where_clause, &alias_ident.value);
                view_args.push(named_arg(
                    "eval_ids",
                    eval_ids_arg(where_clause, &alias_ident.value),
                ));
                view_args.push(named_arg("min_start_time", min_expr));
                view_args.push(named_arg("max_start_time", max_expr));
            }
            *args = Some(TableFunctionArgs {
                args: view_args,
                settings: None,
            });
            *alias = Some(TableAlias {
                name: alias_ident,
                columns: vec![],
                explicit: true,
                at: None,
            });
        }
        ControlFlow::Continue(())
    }
}

/// Which trace time column a WHERE predicate constrains. `start_time` bounds the
/// start_time column directly; because `end_time >= start_time` always holds, an
/// UPPER bound on `end_time` is also an upper bound on `start_time` (a LOWER
/// bound on `end_time` says nothing about start_time, so it is ignored).
#[derive(Clone, Copy, PartialEq)]
enum TimeCol {
    Start,
    End,
}

/// Peel `Expr::Nested` (parenthesization) so the shape underneath can be matched.
fn deparen(expr: &Expr) -> &Expr {
    match expr {
        Expr::Nested(inner) => deparen(inner),
        other => other,
    }
}

/// True if the expression references any table column (bare or qualified
/// identifier). View-function arguments are scalar constants evaluated once at
/// the call site — they cannot reference per-row columns — so a comparison whose
/// value side references a column (e.g. `start_time > other_col`) can't be
/// pushed to a bound and is skipped.
fn expr_references_column(expr: &Expr) -> bool {
    struct ColScanner {
        found: bool,
        // Depth of enclosing `{name:Type}` placeholder dictionaries. Their inner
        // `Type` identifier is not a column reference, so identifiers found while
        // this is non-zero are ignored.
        placeholder_depth: usize,
    }
    impl Visitor for ColScanner {
        type Break = ();
        fn pre_visit_expr(&mut self, expr: &Expr) -> ControlFlow<()> {
            match expr {
                // A `{name:Type}` bind placeholder parses as a Dictionary; it is a
                // scalar evaluated once at the call site, not a per-row column.
                Expr::Dictionary(_) => self.placeholder_depth += 1,
                Expr::Identifier(_) | Expr::CompoundIdentifier(_)
                    if self.placeholder_depth == 0 =>
                {
                    self.found = true;
                    return ControlFlow::Break(());
                }
                _ => {}
            }
            ControlFlow::Continue(())
        }
        fn post_visit_expr(&mut self, expr: &Expr) -> ControlFlow<()> {
            if matches!(expr, Expr::Dictionary(_)) {
                self.placeholder_depth -= 1;
            }
            ControlFlow::Continue(())
        }
    }
    let mut s = ColScanner {
        found: false,
        placeholder_depth: 0,
    };
    let _ = expr.visit(&mut s);
    s.found
}

/// If `expr` is `start_time` / `end_time` (bare or qualified by `alias`), or a
/// supported date-truncation function wrapping one of them, return which column
/// it is plus the truncation bucket width (for widening equality/upper bounds).
fn classify_time_expr(expr: &Expr, alias: &str) -> Option<(TimeCol, Option<&'static str>)> {
    match deparen(expr) {
        Expr::Identifier(ident) => time_col_from_name(&ident.value).map(|c| (c, None)),
        Expr::CompoundIdentifier(parts) if !parts.is_empty() => {
            let col = &parts[parts.len() - 1].value;
            // A qualifier that names a different relation must not be treated as
            // a traces column (avoids applying a joined table's start_time to
            // the traces bounds). An unqualified column is accepted best-effort.
            if parts.len() >= 2
                && parts[parts.len() - 2].value.to_lowercase() != alias.to_lowercase()
            {
                return None;
            }
            time_col_from_name(col).map(|c| (c, None))
        }
        Expr::Function(f) => {
            let func = relation_table_name(&f.name);
            let width = bucket_width_interval(&func)?;
            let args = match &f.args {
                FunctionArguments::List(list) => &list.args,
                _ => return None,
            };
            // Only single-argument truncations `f(<col>)` — `toStartOfInterval`
            // and friends take extra args and are left to the broad default.
            if args.len() != 1 {
                return None;
            }
            let inner = match &args[0] {
                FunctionArg::Unnamed(FunctionArgExpr::Expr(e)) => e,
                _ => return None,
            };
            match classify_time_expr(inner, alias) {
                Some((col, None)) => Some((col, Some(width))),
                _ => None,
            }
        }
        _ => None,
    }
}

fn time_col_from_name(name: &str) -> Option<TimeCol> {
    match name.to_lowercase().as_str() {
        "start_time" => Some(TimeCol::Start),
        "end_time" => Some(TimeCol::End),
        _ => None,
    }
}

/// Wrap a value expression in `toDateTime64(<v>, 9)` so all bound candidates
/// share one comparable type when combined via `least` / `greatest`.
fn to_dt64(value_sql: &str) -> String {
    format!("toDateTime64({value_sql}, 9)")
}

/// Lower/upper start_time bound candidates (as ClickHouse scalar-expression
/// strings) extracted from a subtree. Each is a value every row matching that
/// subtree is guaranteed to respect, or `None` when the subtree gives no bound.
type Bounds = (Option<String>, Option<String>);

/// Analyze a single comparison `left OP right` for a start_time bound.
fn analyze_comparison(left: &Expr, op: &BinaryOperator, right: &Expr, alias: &str) -> Bounds {
    // Identify which side is the (possibly truncated) time column; the other is
    // the value. Flip the operator when the column is on the right.
    let (kind, bucket, value, op) = match classify_time_expr(left, alias) {
        Some((k, b)) => (k, b, deparen(right), op.clone()),
        None => match classify_time_expr(right, alias) {
            Some((k, b)) => (k, b, deparen(left), flip_op(op)),
            None => return (None, None),
        },
    };

    if expr_references_column(value) {
        return (None, None);
    }
    let value_wrapped = to_dt64(&value.to_string());
    // A truncation bucket's real upper edge is value + bucket width; widening is
    // always safe (it can only enlarge the scanned range → underfilter).
    let upper_value = match bucket {
        Some(width) => format!("({value_wrapped} + {width})"),
        None => value_wrapped.clone(),
    };

    match (kind, op) {
        // start_time lower bounds.
        (TimeCol::Start, BinaryOperator::Gt | BinaryOperator::GtEq) => (Some(value_wrapped), None),
        // start_time upper bounds.
        (TimeCol::Start, BinaryOperator::Lt | BinaryOperator::LtEq) => (None, Some(upper_value)),
        // start_time equality bounds both ends.
        (TimeCol::Start, BinaryOperator::Eq) => (Some(value_wrapped), Some(upper_value)),
        // end_time only ever contributes an upper bound on start_time.
        (TimeCol::End, BinaryOperator::Lt | BinaryOperator::LtEq | BinaryOperator::Eq) => {
            (None, Some(upper_value))
        }
        _ => (None, None),
    }
}

/// Analyze `col BETWEEN low AND high` for a start_time bound.
fn analyze_between(expr: &Expr, low: &Expr, high: &Expr, negated: bool, alias: &str) -> Bounds {
    if negated {
        return (None, None);
    }
    let Some((kind, bucket)) = classify_time_expr(expr, alias) else {
        return (None, None);
    };
    let (low, high) = (deparen(low), deparen(high));
    if expr_references_column(low) || expr_references_column(high) {
        return (None, None);
    }
    let high_wrapped = to_dt64(&high.to_string());
    let upper = match bucket {
        Some(width) => format!("({high_wrapped} + {width})"),
        None => high_wrapped,
    };
    match kind {
        TimeCol::Start => (Some(to_dt64(&low.to_string())), Some(upper)),
        // end_time BETWEEN — only the high side bounds start_time (from above).
        TimeCol::End => (None, Some(upper)),
    }
}

fn flip_op(op: &BinaryOperator) -> BinaryOperator {
    match op {
        BinaryOperator::Gt => BinaryOperator::Lt,
        BinaryOperator::GtEq => BinaryOperator::LtEq,
        BinaryOperator::Lt => BinaryOperator::Gt,
        BinaryOperator::LtEq => BinaryOperator::GtEq,
        other => other.clone(),
    }
}

/// Recursively derive start_time bounds from a WHERE subtree with proper
/// boolean semantics: under `AND` every branch's bound holds (take the tightest
/// — `greatest` of lowers, `least` of uppers); under `OR` a bound holds only if
/// *both* branches supply one (take the loosest — `least` of lowers, `greatest`
/// of uppers). A branch with no bound makes the whole `OR` unbounded on that
/// side, which is what prevents `start_time > X OR unrelated = 1` from wrongly
/// dropping the unrelated rows.
fn extract_bounds(expr: &Expr, alias: &str) -> Bounds {
    match deparen(expr) {
        Expr::BinaryOp { left, op, right } => match op {
            BinaryOperator::And => combine(
                extract_bounds(left, alias),
                extract_bounds(right, alias),
                true,
            ),
            BinaryOperator::Or => combine(
                extract_bounds(left, alias),
                extract_bounds(right, alias),
                false,
            ),
            BinaryOperator::Eq
            | BinaryOperator::Gt
            | BinaryOperator::GtEq
            | BinaryOperator::Lt
            | BinaryOperator::LtEq => analyze_comparison(left, op, right, alias),
            _ => (None, None),
        },
        Expr::Between {
            expr,
            negated,
            low,
            high,
        } => analyze_between(expr, low, high, *negated, alias),
        _ => (None, None),
    }
}

fn combine(a: Bounds, b: Bounds, is_and: bool) -> Bounds {
    // AND: tightest valid bound (max lower / min upper).
    // OR: loosest, and only when BOTH branches bound that side.
    let lower = merge(a.0, b.0, is_and, /*lower=*/ true);
    let upper = merge(a.1, b.1, is_and, /*lower=*/ false);
    (lower, upper)
}

fn merge(a: Option<String>, b: Option<String>, is_and: bool, lower: bool) -> Option<String> {
    match (a, b) {
        (Some(x), Some(y)) => {
            // AND-lower / OR-upper want the larger → greatest; the other two the
            // smaller → least.
            let want_greatest = is_and == lower;
            let func = if want_greatest { "greatest" } else { "least" };
            Some(format!("{func}({x}, {y})"))
        }
        (Some(x), None) | (None, Some(x)) if is_and => Some(x),
        _ => None,
    }
}

/// Build the `min_start_time` / `max_start_time` argument expressions for a
/// `traces_v0(...)` call from the enclosing WHERE clause. Derived bounds are
/// padded ±[`START_TIME_PADDING`]; missing bounds fall back to the broad epoch
/// defaults so every trace stays visible.
fn traces_time_bound_args(where_clause: Option<&Expr>, alias: &str) -> (Expr, Expr) {
    let (lower, upper) = where_clause
        .map(|w| extract_bounds(w, alias))
        .unwrap_or((None, None));

    let min_sql = match lower {
        Some(l) => format!("{l} - {START_TIME_PADDING}"),
        None => to_dt64(&format!("'{DEFAULT_MIN_START_TIME}'")),
    };
    let max_sql = match upper {
        Some(u) => format!("{u} + {START_TIME_PADDING}"),
        None => to_dt64(&format!("'{DEFAULT_MAX_START_TIME}'")),
    };

    // These strings are built only from validated column classifications plus
    // constant value sub-expressions, so parsing them back always succeeds; fall
    // back to the broad default rather than propagate an error.
    let min_expr = parse_ch_expr(&min_sql).unwrap_or_else(|_| string_expr(DEFAULT_MIN_START_TIME));
    let max_expr = parse_ch_expr(&max_sql).unwrap_or_else(|_| string_expr(DEFAULT_MAX_START_TIME));
    (min_expr, max_expr)
}

/// `evaluation_id` values a WHERE subtree restricts to. `None` widens to every
/// evaluation, so it is always the safe answer: it costs speed, never rows.
type EvalIds = Option<Vec<Expr>>;

/// A qualifier naming another relation is rejected so a joined table's
/// `evaluation_id` isn't mistaken for this one; unqualified is accepted
/// best-effort, as in [`classify_time_expr`].
fn is_eval_id_column(expr: &Expr, alias: &str) -> bool {
    match deparen(expr) {
        Expr::Identifier(ident) => ident.value.eq_ignore_ascii_case("evaluation_id"),
        Expr::CompoundIdentifier(parts) if !parts.is_empty() => {
            if parts.len() >= 2
                && parts[parts.len() - 2].value.to_lowercase() != alias.to_lowercase()
            {
                return false;
            }
            parts[parts.len() - 1]
                .value
                .eq_ignore_ascii_case("evaluation_id")
        }
        _ => false,
    }
}

/// Same boolean semantics as [`extract_bounds`]: under `AND` either branch's
/// restriction holds, under `OR` only if *both* supply it — which is what stops
/// `evaluation_id = X OR index > 5` from dropping the `index > 5` rows.
fn extract_eval_ids(expr: &Expr, alias: &str) -> EvalIds {
    match deparen(expr) {
        Expr::BinaryOp { left, op, right } => match op {
            BinaryOperator::And => {
                match (
                    extract_eval_ids(left, alias),
                    extract_eval_ids(right, alias),
                ) {
                    // Narrower side, not a true intersection: comparing value
                    // expressions is unreliable and a superset only costs scan work.
                    (Some(a), Some(b)) => Some(if a.len() <= b.len() { a } else { b }),
                    (Some(a), None) | (None, Some(a)) => Some(a),
                    (None, None) => None,
                }
            }
            BinaryOperator::Or => {
                let (a, b) = (
                    extract_eval_ids(left, alias),
                    extract_eval_ids(right, alias),
                );
                match (a, b) {
                    (Some(mut a), Some(b)) => {
                        a.extend(b);
                        Some(a)
                    }
                    _ => None,
                }
            }
            BinaryOperator::Eq => {
                let value = if is_eval_id_column(left, alias) {
                    deparen(right)
                } else if is_eval_id_column(right, alias) {
                    deparen(left)
                } else {
                    return None;
                };
                // View args are scalars evaluated once at the call site, so a
                // per-row column can't be hoisted into one.
                if expr_references_column(value) {
                    return None;
                }
                Some(vec![value.clone()])
            }
            _ => None,
        },
        Expr::InList {
            expr: col,
            list,
            negated,
        } => {
            // `NOT IN` does not narrow.
            if *negated || list.is_empty() || !is_eval_id_column(col, alias) {
                return None;
            }
            if list.iter().any(expr_references_column) {
                return None;
            }
            Some(list.iter().map(deparen).cloned().collect())
        }
        _ => None,
    }
}

/// A `{name: Array(...)}` bind is already an array, so wrapping it in `toUUID`
/// would yield `toUUID(<array>)`, which ClickHouse rejects.
fn is_array_placeholder(expr: &Expr) -> bool {
    let Expr::Dictionary(fields) = deparen(expr) else {
        return false;
    };
    matches!(
        fields.first().map(|f| f.value.as_ref()),
        Some(Expr::Function(f)) if relation_table_name(&f.name) == "array"
    )
}

/// The empty array is the view's "no evaluation filter" sentinel, so a WHERE we
/// cannot narrow safely degrades to the unoptimized scan.
fn eval_ids_arg(where_clause: Option<&Expr>, alias: &str) -> Expr {
    let ids = where_clause
        .and_then(|w| extract_eval_ids(w, alias))
        .unwrap_or_default();
    // A lone array bind *is* the view argument. Mixed array+scalar sets can't be
    // concatenated here, so widen.
    if ids.iter().any(is_array_placeholder) {
        if let [id] = ids.as_slice() {
            return id.clone();
        }
        return Expr::Array(sqlparser::ast::Array {
            elem: vec![],
            named: false,
        });
    }
    // `toUUID` so a string literal or placeholder matches the view's
    // `Array(UUID)` parameter.
    Expr::Array(sqlparser::ast::Array {
        elem: ids
            .into_iter()
            .map(|e| {
                Expr::Function(sqlparser::ast::Function {
                    name: ObjectName(vec![ObjectNamePart::Identifier(Ident::new("toUUID"))]),
                    uses_odbc_syntax: false,
                    parameters: FunctionArguments::None,
                    args: FunctionArguments::List(sqlparser::ast::FunctionArgumentList {
                        duplicate_treatment: None,
                        args: vec![FunctionArg::Unnamed(FunctionArgExpr::Expr(e))],
                        clauses: vec![],
                    }),
                    filter: None,
                    null_treatment: None,
                    over: None,
                    within_group: vec![],
                })
            })
            .collect(),
        named: false,
    })
}

fn named_arg(name: &str, value: Expr) -> FunctionArg {
    FunctionArg::Named {
        name: Ident::new(name),
        arg: FunctionArgExpr::Expr(value),
        operator: FunctionArgOperator::Equals,
    }
}

fn string_expr(value: &str) -> Expr {
    Expr::Value(ValueWithSpan {
        value: Value::SingleQuotedString(value.to_string()),
        span: sqlparser::tokenizer::Span::empty(),
    })
}

fn strip_settings(statement: &mut Statement) {
    struct SettingsStripper;
    impl VisitorMut for SettingsStripper {
        type Break = ();
        fn pre_visit_query(&mut self, query: &mut Query) -> ControlFlow<()> {
            query.settings = None;
            ControlFlow::Continue(())
        }
    }
    let _ = VisitMut::visit(statement, &mut SettingsStripper);
}

#[cfg(test)]
mod tests;
