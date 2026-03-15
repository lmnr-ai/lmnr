import { defineRegistry } from "@json-render/react";

import { agentCatalog } from "./catalog";
import CreateSignalCard from "./create-signal-card";
import GraphCard from "./graph-card";
import ListCard from "./list-card";
import MetricsCard from "./metrics-card";
import QuerySQLCard from "./query-sql-card";
import TraceCard from "./trace-card";

const { registry: agentCardRegistry } = defineRegistry(agentCatalog, {
  components: {
    TraceCard,
    MetricsCard,
    ListCard,
    CreateSignalCard,
    QuerySQLCard,
    GraphCard,
  },
});

export { agentCardRegistry };
