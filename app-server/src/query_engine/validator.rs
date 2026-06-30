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
    Expr, FunctionArg, FunctionArgExpr, FunctionArgOperator, Ident, JoinOperator, ObjectName,
    ObjectNamePart, Query, Select, Statement, TableAlias, TableFactor, TableFunctionArgs, Value,
    ValueWithSpan, Visit, VisitMut, Visitor, VisitorMut,
};
use sqlparser::dialect::{ClickHouseDialect, Dialect, Precedence};
use sqlparser::keywords::Keyword;
use sqlparser::parser::{Parser, ParserError};
use sqlparser::tokenizer::{Span, Token, Tokenizer};

const VIEW_VERSION: &str = "v0";

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
            // Network / remote table access
            "url",
            "remote",
            "remotesecure",
            // S3 / cloud storage
            "s3",
            "s3cluster",
            "gcs",
            "oss",
            "cosn",
            "hdfs",
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
            // Misc dangerous
            "executable",
            "azureblobstorage",
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
const BLOCKED_FUNCTION_PREFIXES: &[&str] = &["dictget", "dicthas", "dictis", "joinget"];

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
            "input_cost",
            "output_cost",
            "total_cost",
            "attributes",
            "trace_id",
            "tags",
            "tool_definitions",
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
            "root_span_input",
            "root_span_output",
        ];

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

        // ARRAY JOIN right-hand sides are array columns, not table references —
        // identified by source span so they're skipped (not rewritten into
        // `_v0(...)`) across all passes. The rewriter leaves these nodes intact,
        // so the same spans stay valid for the post-rewrite check; compute once.
        let array_join_spans = collect_array_join_spans(&statement);

        self.validate_security(&statement)?;
        // Reject CTEs that shadow an allowlisted physical table. CTE-name
        // collection (`collect_cte_names`) is global, not lexically scoped, so a
        // CTE named `spans` defined in an inner scope would otherwise make the
        // rewriter skip an outer `FROM spans` (the real physical table) — a
        // cross-tenant leak. Forbidding the collision keeps the invariant
        // "allowlisted name ⇒ always a physical table ⇒ always rewritten".
        self.validate_cte_names(&statement)?;
        self.validate_tables_and_columns(&statement, &array_join_spans)?;

        let cte_names = collect_cte_names(&statement);
        let mut rewriter = ViewRewriter {
            registry: &self.registry,
            project_id,
            cte_names,
            array_join_spans: &array_join_spans,
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
        self.validate_post_rewrite(&statement, &array_join_spans)?;

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
    /// `array_join_spans` are exempt — those array-column relations are
    /// intentionally left un-rewritten (they aren't tables).
    fn validate_post_rewrite(
        &self,
        statement: &Statement,
        array_join_spans: &HashSet<Span>,
    ) -> Result<(), String> {
        let mut scan = BlockedScanner { blocked: None };
        let _ = statement.visit(&mut scan);
        if let Some(name) = scan.blocked {
            return Err(format!("Function '{name}' is not allowed"));
        }

        let mut checker = PostRewriteChecker {
            registry: &self.registry,
            array_join_spans,
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
        array_join_spans: &HashSet<Span>,
    ) -> Result<(), String> {
        let cte_names = collect_cte_names(statement);
        let mut checker = TableColumnChecker {
            registry: &self.registry,
            cte_names: &cte_names,
            array_join_spans,
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
fn relation_name_span(name: &ObjectName) -> Option<Span> {
    match name.0.last()? {
        ObjectNamePart::Identifier(ident) => Some(ident.span),
        _ => None,
    }
}

/// Collect the source spans of every relation that is the right-hand side of a
/// ClickHouse `ARRAY JOIN`. In `... ARRAY JOIN clusters AS cluster_id`, `clusters`
/// is an **array column** of the left table, not a table reference — `sqlparser`
/// nonetheless models it as a `TableFactor::Table`. We key by span so the
/// table/column visitors can recognise and skip exactly that occurrence without
/// affecting a genuine `FROM clusters` elsewhere in the query.
fn collect_array_join_spans(statement: &Statement) -> HashSet<Span> {
    struct ArrayJoinCollector {
        spans: HashSet<Span>,
    }
    impl Visitor for ArrayJoinCollector {
        type Break = ();
        fn pre_visit_select(&mut self, select: &Select) -> ControlFlow<()> {
            for twj in &select.from {
                for join in &twj.joins {
                    if matches!(
                        join.join_operator,
                        JoinOperator::ArrayJoin
                            | JoinOperator::LeftArrayJoin
                            | JoinOperator::InnerArrayJoin
                    ) && let TableFactor::Table { name, .. } = &join.relation
                        && let Some(span) = relation_name_span(name)
                    {
                        self.spans.insert(span);
                    }
                }
            }
            ControlFlow::Continue(())
        }
    }
    let mut c = ArrayJoinCollector {
        spans: HashSet::new(),
    };
    let _ = statement.visit(&mut c);
    c.spans
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
    array_join_spans: &'a HashSet<Span>,
    error: Option<String>,
}

impl Visitor for TableColumnChecker<'_> {
    type Break = ();

    fn pre_visit_relation(&mut self, name: &ObjectName) -> ControlFlow<()> {
        // An ARRAY JOIN right-hand side is an array column of the left table,
        // not a table reference — don't validate it against the table allowlist.
        if relation_name_span(name).is_some_and(|s| self.array_join_spans.contains(&s)) {
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
    array_join_spans: &'a HashSet<Span>,
    error: Option<String>,
}

impl Visitor for PostRewriteChecker<'_> {
    type Break = ();

    fn pre_visit_table_factor(&mut self, table_factor: &TableFactor) -> ControlFlow<()> {
        if let TableFactor::Table { name, args, .. } = table_factor {
            // ARRAY JOIN array-column relations are intentionally left un-rewritten;
            // they aren't tables, so don't flag them as "not project-scoped".
            if relation_name_span(name).is_some_and(|s| self.array_join_spans.contains(&s)) {
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
    array_join_spans: &'a HashSet<Span>,
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
            // An ARRAY JOIN right-hand side is an array column of the left table,
            // not a table reference — leave it exactly as written. (sqlparser
            // models it as a `TableFactor::Table`, so without this guard we'd
            // rewrite e.g. `ARRAY JOIN clusters` into `clusters_v0(...)`.)
            if relation_name_span(name).is_some_and(|s| self.array_join_spans.contains(&s)) {
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
            *args = Some(TableFunctionArgs {
                args: vec![named_arg("project_id", string_expr(self.project_id))],
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
