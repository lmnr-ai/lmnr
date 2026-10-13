import assert from "node:assert/strict";
import test from "node:test";

import { renderToString } from "react-dom/server";

import FilterSelect from "@/components/common/advanced-search/components/filter-select";

const renderSelect = () =>
  renderToString(
    <FilterSelect
      value="critical"
      options={[
        { value: "critical", label: "Critical" },
        { value: "warning", label: "Warning" },
      ]}
      onValueChange={() => {}}
      open={false}
      onOpenChange={() => {}}
    />
  );

test("FilterSelect uses a stable listbox id during server and client renders", () => {
  const firstRender = renderSelect();
  const secondRender = renderSelect();

  const getListboxId = (html: string) => html.match(/aria-controls="([^"]+)"/)?.[1];

  assert.equal(getListboxId(firstRender), getListboxId(secondRender));
});
