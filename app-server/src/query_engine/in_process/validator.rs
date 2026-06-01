//! Secure query validation and view-function rewriting for the in-process
//! query engine. Ported from `query-engine/src/query_validator.py`.
//!
//! This is a security boundary: it enforces SELECT-only access, blocks
//! ClickHouse functions that can reach the filesystem / network / other
//! tenants, rejects `project_id` access and unknown table-qualified columns,
//! and rewrites allowed table references to their project-scoped `_v0` view
//! functions.

use std::collections::{HashMap, HashSet};
use std::ops::ControlFlow;

use sqlparser::ast::{
    Expr, FunctionArg, FunctionArgExpr, FunctionArgOperator, Ident, ObjectName, ObjectNamePart,
    Query, Select, Statement, TableAlias, TableFactor, TableFunctionArgs, Value, ValueWithSpan,
    Visit, VisitMut, Visitor, VisitorMut,
};
use sqlparser::dialect::ClickHouseDialect;
use sqlparser::parser::Parser;

const VIEW_VERSION: &str = "v0";
const DEFAULT_START_TIME: &str = "1970-01-01 00:00:00";
const DEFAULT_END_TIME: &str = "2099-12-31 23:59:59";

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
            // Dictionary access (bypasses table validation)
            "dictget",
            "dictgetordefault",
            "dictgetornull",
            "dicthas",
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

/// Scan an expression subtree for any blocked function call (used by the
/// json_to_sql raw-expression validator). Returns the blocked name if found.
pub fn find_blocked_function_in_expr(expr: &Expr) -> Option<String> {
    let mut scan = BlockedScanner { blocked: None };
    let _ = expr.visit(&mut scan);
    scan.blocked
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

        let events_columns = [
            "id",
            "span_id",
            "name",
            "timestamp",
            "attributes",
            "trace_id",
            "user_id",
            "session_id",
        ];

        let tags_columns = ["id", "span_id", "name", "created_at", "source"];

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
            "centroid",
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
        tables.insert(
            "dataset_datapoints",
            schema(&dataset_datapoints_columns),
        );
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
        tables.insert("events", schema(&events_columns));
        tables.insert("tags", schema(&tags_columns));
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
        tables.insert(
            "event_clusters_all",
            schema(&event_clusters_all_columns),
        );

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
        let dialect = ClickHouseDialect {};
        let mut statements = Parser::parse_sql(&dialect, sql_query)
            .map_err(|e| format!("Query validation failed: {e}"))?;

        if statements.len() != 1 {
            return Err("Only SELECT statements are allowed".to_string());
        }
        let mut statement = statements.remove(0);

        self.validate_security(&statement)?;
        self.validate_tables_and_columns(&statement)?;

        let cte_names = collect_cte_names(&statement);
        let mut rewriter = ViewRewriter {
            registry: &self.registry,
            project_id,
            cte_names,
            where_stack: Vec::new(),
            error: None,
        };
        let _ = VisitMut::visit(&mut statement, &mut rewriter);
        if let Some(e) = rewriter.error {
            return Err(e);
        }

        strip_settings(&mut statement);

        Ok(statement.to_string())
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

    fn validate_tables_and_columns(&self, statement: &Statement) -> Result<(), String> {
        let cte_names = collect_cte_names(statement);
        let mut checker = TableColumnChecker {
            registry: &self.registry,
            cte_names: &cte_names,
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

struct BlockedScanner {
    blocked: Option<String>,
}

impl Visitor for BlockedScanner {
    type Break = ();

    fn pre_visit_expr(&mut self, expr: &Expr) -> ControlFlow<()> {
        if let Expr::Function(f) = expr {
            let name = relation_table_name(&f.name);
            if blocked_functions().contains(name.as_str()) {
                self.blocked = Some(name);
                return ControlFlow::Break(());
            }
        }
        ControlFlow::Continue(())
    }

    fn pre_visit_relation(&mut self, name: &ObjectName) -> ControlFlow<()> {
        let table = relation_table_name(name);
        if blocked_functions().contains(table.as_str()) {
            self.blocked = Some(table);
            return ControlFlow::Break(());
        }
        ControlFlow::Continue(())
    }
}

struct TableColumnChecker<'a> {
    registry: &'a TableRegistry,
    cte_names: &'a HashSet<String>,
    error: Option<String>,
}

impl Visitor for TableColumnChecker<'_> {
    type Break = ();

    fn pre_visit_relation(&mut self, name: &ObjectName) -> ControlFlow<()> {
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

struct ViewRewriter<'a> {
    registry: &'a TableRegistry,
    project_id: &'a str,
    cte_names: HashSet<String>,
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
            // Don't rewrite something that is already a table function.
            if args.is_some() {
                return ControlFlow::Continue(());
            }

            let table_name = relation_table_name(name);

            // Skip CTE references and non-allowlisted tables (the latter is
            // rejected earlier in validation; here we just leave them alone).
            if self.cte_names.contains(&table_name)
                || !self.registry.is_table_allowed(&table_name)
            {
                return ControlFlow::Continue(());
            }

            let view_name = format!("{table_name}_{VIEW_VERSION}");
            let alias_ident = alias
                .as_ref()
                .map(|a| a.name.clone())
                .unwrap_or_else(|| Ident::new(table_name.clone()));

            let mut fn_args = vec![named_arg("project_id", string_expr(self.project_id))];

            if table_name == "traces" {
                let table_alias = alias.as_ref().map(|a| a.name.value.to_lowercase());
                let (start_time, end_time) = extract_time_filters_for_traces(
                    self.where_stack.last().and_then(|w| w.as_ref()),
                    table_alias.as_deref(),
                );
                fn_args.push(named_arg("start_time", start_time));
                fn_args.push(named_arg("end_time", end_time));
            }

            *name = ObjectName(vec![ObjectNamePart::Identifier(Ident::new(view_name))]);
            *args = Some(TableFunctionArgs {
                args: fn_args,
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

/// Extract start_time / end_time bounds for the traces view function from a
/// WHERE expression. Defaults to the unix epoch / far future when absent.
/// `table_alias` is the alias the query gave the traces table (if any), so
/// predicates qualified by the alias (`FROM traces t WHERE t.start_time >= …`)
/// are still picked up rather than dropped to the epoch-wide default.
fn extract_time_filters_for_traces(
    where_expr: Option<&Expr>,
    table_alias: Option<&str>,
) -> (Expr, Expr) {
    let mut start_time = string_expr(DEFAULT_START_TIME);
    let mut end_time = string_expr(DEFAULT_END_TIME);

    if let Some(expr) = where_expr {
        walk_time_filters(expr, table_alias, &mut start_time, &mut end_time);
    }

    (start_time, end_time)
}

/// Whether a column qualifier refers to the traces table being rewritten:
/// unqualified, the literal table name `traces`, or the query's alias for it.
fn qualifier_matches_traces(qualifier: Option<&str>, table_alias: Option<&str>) -> bool {
    match qualifier {
        None => true,
        Some(q) => q == "traces" || table_alias == Some(q),
    }
}

/// Returns `(qualifier, column_name_lower)` for an identifier/compound column.
fn column_ref(expr: &Expr) -> Option<(Option<String>, String)> {
    match expr {
        Expr::Identifier(ident) => Some((None, ident.value.to_lowercase())),
        Expr::CompoundIdentifier(parts) if !parts.is_empty() => {
            let column = parts.last().unwrap().value.to_lowercase();
            let qualifier = if parts.len() >= 2 {
                Some(parts[parts.len() - 2].value.to_lowercase())
            } else {
                None
            };
            Some((qualifier, column))
        }
        _ => None,
    }
}

fn walk_time_filters(
    expr: &Expr,
    table_alias: Option<&str>,
    start_time: &mut Expr,
    end_time: &mut Expr,
) {
    use sqlparser::ast::BinaryOperator as Op;

    match expr {
        Expr::Nested(inner) => walk_time_filters(inner, table_alias, start_time, end_time),
        Expr::BinaryOp { left, op, right } => match op {
            Op::And | Op::Or => {
                walk_time_filters(left, table_alias, start_time, end_time);
                walk_time_filters(right, table_alias, start_time, end_time);
            }
            Op::Gt | Op::GtEq | Op::Lt | Op::LtEq | Op::Eq => {
                if let Some((qualifier, column)) = column_ref(left) {
                    if !qualifier_matches_traces(qualifier.as_deref(), table_alias) {
                        return;
                    }
                    if column == "start_time" {
                        match op {
                            Op::Gt | Op::GtEq => *start_time = (**right).clone(),
                            Op::Lt | Op::LtEq => *end_time = (**right).clone(),
                            _ => {}
                        }
                    } else if column == "end_time" {
                        if matches!(op, Op::Lt | Op::LtEq) {
                            *end_time = (**right).clone();
                        }
                    }
                }
            }
            _ => {}
        },
        Expr::Between {
            expr: inner,
            negated: false,
            low,
            high,
        } => {
            if let Some((qualifier, column)) = column_ref(inner) {
                if !qualifier_matches_traces(qualifier.as_deref(), table_alias) {
                    return;
                }
                if column == "start_time" {
                    *start_time = (**low).clone();
                    *end_time = (**high).clone();
                } else if column == "end_time" {
                    *end_time = (**high).clone();
                }
            }
        }
        _ => {}
    }
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
