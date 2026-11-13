/** URL params holding the run page's table state: saved view, filters, search, sort, comparison run. */
const RUN_TABLE_PARAMS = ["v", "filter", "search", "sortBy", "sortDirection", "targetId"];

/** The run table's params from `from`, so links to and back from a trial keep the table as the user left it. */
export function runTableParams(from: { getAll: (key: string) => string[] }): URLSearchParams {
  const params = new URLSearchParams();
  RUN_TABLE_PARAMS.forEach((key) => from.getAll(key).forEach((value) => params.append(key, value)));
  return params;
}
