const STYLE_GUIDE = `<laminar_ui_style_guide>
Laminar uses Tailwind CSS with a dark-first palette and small, dense, monospace-leaning UI.
Generated templates render inside a sandboxed iframe whose Tailwind theme is wired up to
Laminar's semantic design tokens. ALWAYS prefer these semantic classes over raw palette
names — they automatically match the current Laminar theme. (Stock Tailwind classes like
\`text-sky-400\` or \`bg-neutral-900\` still work but will visually drift from the rest of
the platform; avoid them.)

Surfaces
- Root container: \`w-full min-h-full p-4 text-sm text-foreground bg-background\` (use \`min-h-full\`, NOT \`h-full\`, so taller content can scroll vertically)
- Cards / panels: \`rounded-md border border-border bg-card text-card-foreground p-3\`
- Popovers / floating surfaces: \`rounded-md border border-border bg-popover text-popover-foreground\`
- Muted surfaces (subtle backgrounds for hovered rows, side panels): \`bg-muted text-muted-foreground\`
- Accent surfaces (for selected items): \`bg-accent text-accent-foreground\`

Text
- Section headings: \`text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2\`
- Labels: \`text-xs text-muted-foreground\`
- Values: \`text-sm text-foreground\`
- Code / ids / JSON / numbers: \`font-mono text-xs text-foreground\`
- Secondary / de-emphasised: \`text-muted-foreground\`

Accents (use sparingly — these are signal, not decoration)
- Primary accent (key numbers, highlights): \`text-primary\` / \`bg-primary\` / \`border-primary\`
- Success: \`text-success\`; brighter variant for badges or thin strokes: \`text-success-bright\`
- Error / destructive: \`text-destructive\`; brighter variant: \`text-destructive-bright\`
- Categorical accents for span/operation types:
  - LLM / model spans: \`text-llm\` / \`bg-llm\` (with \`text-llm-foreground\` for contrast text)
  - Tool / function calls: \`text-tool\` (warm amber)
  - Subagent / nested agent spans: \`text-subagent\` (cyan)

Components
- Badges / chips: \`inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground\`
- Separators: \`border-t border-border\` (prefer whitespace over heavy dividers)
- Grids / key-value layouts: \`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs\` with label in \`text-muted-foreground\` and value in \`text-foreground\`
- Status pills: pair a background tint with the matching accent text — e.g. success: \`bg-success/15 text-success\`, error: \`bg-destructive/15 text-destructive\`

Layout / density
- Keep paddings tight: \`p-2\` / \`p-3\` on cards, \`gap-2\` / \`gap-3\` between rows
- Avoid \`p-6\`, \`text-lg\`, \`rounded-xl\`, colourful gradients, glow shadows — they don't fit Laminar's compact UI
- Favour grids and aligned columns over hero layouts
- No external images, icons, fonts, or fetched resources. Use Unicode glyphs (\`•\`, \`↗\`, \`✓\`, \`✕\`, \`→\`) when a marker is needed

Structure & robustness (MUST follow on every template)
- The root container ALWAYS sets:
  - Outer padding: \`p-4\` (never \`p-0\` — content should not touch the iframe edge).
  - Full size: \`w-full min-h-full\` (use \`min-h-full\`, not \`h-full\`, so taller content can grow and scroll).
  - Background + text colour: \`bg-background text-foreground\`.
  - Vertical overflow: do NOT add \`overflow-hidden\` to the root — the iframe body handles scroll. If you intentionally want a fixed-height scrollable inner region (e.g. a long list inside a card), apply \`overflow-y-auto\` and a max-height to that inner container only.
- Wrap the entire UI in ONE card by default (\`rounded-md border border-border bg-card p-3\`) unless the template has multiple distinct sections — in that case use \`flex flex-col gap-3\` of cards.
- Long string values must use \`truncate\` or \`break-all\` (depending on whether they're ids vs prose) so they never blow out the layout horizontally.
- For lists / arrays, render an empty-state when the array is empty or missing: a single muted line like \`<div className="text-xs text-muted-foreground italic">No items</div>\`. Never render an empty card with no rows.
- For unknown / nullish primitive values, render an em-dash \`—\` in \`text-muted-foreground\` rather than the strings "undefined" or "null".
- Numbers: format with thousands separators (\`Number(n).toLocaleString()\`) and units when known (\`ms\`, \`s\`, \`tokens\`, \`$\`). Durations in ms below 1000 should display as \`Xms\`, above as \`X.YYs\`. Costs as \`$X.XXXX\` (4 decimals for sub-cent precision).
- Booleans: render as \`✓\` / \`✕\` glyphs with \`text-success\` / \`text-muted-foreground\` rather than the literal words "true"/"false", unless context demands otherwise.
- Timestamps / dates: if the input looks like ISO 8601 or a unix epoch, format with \`new Date(value).toLocaleString()\`. Show the raw value in a \`title\` tooltip for precision.
- Whenever you map over an array, give each child a stable \`key\` derived from the item (id, name, index as a last resort).
- Limit nesting to two cards deep — avoid card-in-card-in-card stacks; collapse with separators or grids instead.
</laminar_ui_style_guide>`;

const OUTPUT_CONTRACT = `<output_contract>
The template MUST be a single JavaScript function expression with this exact shape:

function({ data }) {
  return (
    <div className="...">
      {/* JSX here */}
    </div>
  );
}

Hard rules:
- Use HTML/JSX syntax (no TypeScript, no imports, no exports).
- The function receives a single argument \`{ data }\`. Always destructure as \`function({ data })\`.
- Return ONE root JSX element. Use Tailwind classes via \`className\`.
- Available hooks: \`useState\`, \`useEffect\`, \`useMemo\`, \`useRef\`, \`useCallback\`, \`useContext\` (already in scope — do NOT import).
- \`Fragment\` is in scope. When rendering siblings in a list, give each iteration a stable \`key\` (e.g. \`<Fragment key={...}>\`). Never emit \`<>\`/\`</>\` inside an \`Array.map\` — bare fragments cannot carry a key.
- You may use \`JSON.stringify\`, \`Array.isArray\`, \`Object.entries\`, \`Object.keys\`, \`String\`, \`Number\`, \`Boolean\`.
- Be defensive: \`data\` may be \`undefined\`, \`null\`, a primitive, an array, or an object. Guard every access (\`data?.foo\`, \`Array.isArray(data) ? data : []\`).
- Do NOT call \`fetch\`, \`XMLHttpRequest\`, \`WebSocket\`, \`EventSource\`, \`navigator.sendBeacon\`, \`window.open\`, \`document.cookie\`, \`localStorage\`, or any other I/O API. They are blocked in the sandbox and will throw.
- Do NOT reference external URLs, \`<script>\`, \`<iframe>\`, \`<style>\`, \`<link>\`, inline event handlers on strings, or \`dangerouslySetInnerHTML\`.
- Do NOT use \`import\`, \`require\`, \`eval\`, \`new Function\`, or top-level \`await\`.
</output_contract>`;

const EXAMPLE = `<example>
<user_request>render the trace metadata with status, latency and cost</user_request>
<assistant_output>
function({ data }) {
  const entries = data && typeof data === 'object' ? Object.entries(data) : [];
  const status = data?.status ?? 'unknown';
  const statusTone = status === 'success'
    ? 'bg-success/15 text-success'
    : status === 'error'
    ? 'bg-destructive/15 text-destructive'
    : 'bg-muted text-muted-foreground';
  return (
    <div className="w-full min-h-full p-4 text-sm text-foreground bg-background">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trace</div>
          <span className={\`rounded-sm px-1.5 py-0.5 text-[11px] font-mono \${statusTone}\`}>{String(status)}</span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {entries.map(([key, value]) => (
            <Fragment key={key}>
              <div className="text-muted-foreground">{key}</div>
              <div className="font-mono text-foreground truncate">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
</assistant_output>
</example>`;

export function getTemplateGenerationPrompts(currentCode?: string, testData?: string) {
  const currentCodeBlock = currentCode?.trim()
    ? `\n<current_template>\n${currentCode}\n</current_template>\n\nWhen the user asks to modify, tweak, or extend the existing template, start from this code and apply the requested changes.`
    : "";

  const testDataBlock = testData?.trim()
    ? `\n<sample_data>\n${testData.slice(0, 4000)}\n</sample_data>\n\nUse the shape of this sample to decide which fields to render. Do not hardcode its values.`
    : "";

  const system = `You are a UI generator for Laminar, an open-source observability platform for AI agents.
You produce small JSX templates that render arbitrary JSON payloads inside a sandboxed iframe using Preact + Tailwind (via twind). The iframe's Tailwind theme is wired up to Laminar's semantic design tokens — see the style guide below.

You operate as a chat: the user iterates on the template across multiple turns. On every turn, ALWAYS return the FULL template function as \`result\` (not a diff or a snippet) — the iframe re-renders from scratch each time. Apply the user's latest instruction to the most recent version of the template (provided as \`<current_template>\` if it exists, otherwise build from scratch).

Output fields:
- \`success\` — true if you can build it, false otherwise.
- \`result\` — the full template function (only when success is true). Always complete and self-contained.
- \`summary\` — a short (5-12 words) one-line summary of what you just built or changed, addressed to the user (e.g. "Added a status badge", "Initial status card with latency and cost", "Made the header sticky"). Required when success is true.
- \`error\` — only when success is false.

If the user's request is not about rendering data as UI, respond with:
- success: false
- error: brief explanation of why the request cannot be fulfilled

${STYLE_GUIDE}

${OUTPUT_CONTRACT}

${EXAMPLE}
${currentCodeBlock}${testDataBlock}`;

  return {
    system,
    user: (prompt: string) => prompt,
  };
}
