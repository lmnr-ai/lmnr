export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export interface Pagination {
  limit: number;
  offset: number;
}

const parseParam = (raw: unknown, name: string): number | string => {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return `${name} must be a non-negative integer`;
  }
  return Number(raw);
};

/**
 * Parse offset-based pagination params off a query string.
 * Returns { error } instead of throwing so handlers can answer with a 400.
 */
export const parsePagination = (
  query: Record<string, unknown>,
): Pagination | { error: string } => {
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  if (query.limit !== undefined) {
    const parsed = parseParam(query.limit, 'limit');
    if (typeof parsed === 'string') return { error: parsed };
    if (parsed < 1 || parsed > MAX_LIMIT) {
      return { error: `limit must be between 1 and ${MAX_LIMIT}` };
    }
    limit = parsed;
  }

  if (query.offset !== undefined) {
    const parsed = parseParam(query.offset, 'offset');
    if (typeof parsed === 'string') return { error: parsed };
    offset = parsed;
  }

  return { limit, offset };
};
