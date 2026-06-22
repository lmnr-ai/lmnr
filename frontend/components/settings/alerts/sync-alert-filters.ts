import { type AlertFilterFormItem } from "./alert-filters-section";

/**
 * Sync alert filters by creating new, updating existing, and deleting removed
 * filters. Returns the final list with server-assigned IDs.
 */
export async function syncAlertFilters(
  projectId: string,
  alertId: string,
  filterItems: AlertFilterFormItem[],
  previousFilterIds: string[]
): Promise<AlertFilterFormItem[]> {
  const valid = filterItems.filter((t) => t.filters.length > 0);
  const currentIds = valid.filter((t) => t.id).map((t) => t.id!);
  const toDelete = previousFilterIds.filter((id) => !currentIds.includes(id));
  const toCreate = valid.filter((t) => !t.id);
  const toUpdate = valid.filter((t) => t.id);

  const baseUrl = `/api/projects/${projectId}/alerts/${alertId}/filters`;

  const ensureOk = async (res: Response, action: string) => {
    if (!res.ok) {
      const message = await res
        .json()
        .then((d) => d?.error)
        .catch(() => null);
      throw new Error(message ?? `Failed to ${action} alert filter`);
    }
    return res;
  };

  // Run non-destructive creates/updates first; only delete once they succeed so a
  // failed PUT/POST can't leave existing filters removed after the alert was saved.
  await Promise.all(
    toUpdate.map((filterItem) =>
      fetch(baseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterId: filterItem.id, filters: filterItem.filters }),
      }).then((res) => ensureOk(res, "update"))
    )
  );

  const created = await Promise.all(
    toCreate.map(async (filterItem) => {
      const res = await ensureOk(
        await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: filterItem.filters }),
        }),
        "create"
      );
      const body = (await res.json()) as { id: string; filters: AlertFilterFormItem["filters"] };
      return { id: body.id, filters: body.filters };
    })
  );

  if (toDelete.length > 0) {
    await fetch(baseUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filterIds: toDelete }),
    }).then((res) => ensureOk(res, "delete"));
  }

  let createIndex = 0;
  return valid.map((t) => (t.id ? t : (created[createIndex++] ?? t)));
}
