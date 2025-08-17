import { Operator } from "@/components/ui/datatable-filter/utils";
import { processFilters, processors } from "@/lib/actions/common/utils";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";

const processEventAttributeFilter = (filter: FilterDef): FilterDef => {
  switch (filter.column) {
    case "id":
      return {
        ...filter,
        value: filter.value.startsWith("00000000-0000-0000-") ? filter.value : `00000000-0000-0000-${filter.value}`,
      };

    case "span_id":
      return {
        ...filter,
        column: "span_id",
        value: filter.value.startsWith("00000000-0000-0000-") ? filter.value : `00000000-0000-0000-${filter.value}`,
      };

    case "attributes":
      return { ...filter, column: "attributes::text" };

    default:
      return filter;
  }
};

export const processEventFilters = (filters: FilterDef[]) =>
  processFilters<FilterDef, any>(filters, {
    processors: processors<FilterDef, any>([
      {
        column: "attributes",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => filtersToSql([{ ...filter, column: "attributes::text" }], [])[0],
      },
    ]),
    defaultProcessor: (filter) => {
      const processed = processEventAttributeFilter(filter);
      return filtersToSql([processed], [new RegExp(/^attributes::text$/)])[0] || null;
    },
  });
