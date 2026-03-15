import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";

import { cardComponentDefs } from "./catalog-server";

/**
 * Client-side catalog using @json-render/react schema.
 * This MUST NOT be imported from server-side code (API routes)
 * because @json-render/react calls createContext at module level.
 *
 * For server-side prompt generation, use catalog-server.ts instead.
 */
export const agentCatalog = defineCatalog(schema, {
  components: cardComponentDefs,
  actions: {},
});
