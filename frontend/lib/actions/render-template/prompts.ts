// Self-contained prompt the user copies into their own AI tool to generate a
// Laminar render template. Three things only: how to style it (Laminar tokens),
// what code shape to return (function({ data }) JSX), and a slot for the
// user's data + request.

const STYLE_GUIDE = `<laminar_ui_style_guide>
Laminar uses Tailwind CSS with a dark-first palette and small, dense, monospace-leaning UI.
Generated templates render inside a sandboxed iframe whose Tailwind theme is wired up to
Laminar's semantic design tokens. ALWAYS prefer these semantic classes over raw palette
names — they automatically match the current Laminar theme. (Stock Tailwind classes like
\`text-sky-400\` or \`bg-neutral-900\` still work but will visually drift from the rest of
the platform; avoid them.)

Available semantic tokens (exhaustive — these are what twind knows about; nothing else is wired)
- Surface / foreground pairs (use as \`bg-<name>\` for the background, \`text-<name>-foreground\` for legible text on top):
  - \`background\` / \`foreground\` — the page itself.
  - \`card\` / \`card-foreground\` — main content card.
  - \`popover\` / \`popover-foreground\` — floating surfaces.
  - \`secondary\` / \`secondary-foreground\` — subtle inset surface (nested rows, kv blocks).
  - \`muted\` / \`muted-foreground\` — slightly more pronounced inset (hover rows, side panels).
  - \`accent\` / \`accent-foreground\` — selected / highlighted items.
  - \`primary\` / \`primary-foreground\` — primary-action surfaces (CTA chips, key callouts). \`text-primary\` is also the highlight text colour.
  - \`destructive\` / \`destructive-foreground\` — error banners.
  - \`success\` / \`success-foreground\` — success banners.
- Plain text colours (no companion surface — use on top of \`bg-background\` / \`bg-card\` / etc.):
  - \`text-foreground\` (primary text) · \`text-secondary-foreground\` (one notch down) · \`text-muted-foreground\` (de-emphasised) · \`text-card-foreground\` / \`text-popover-foreground\` / \`text-accent-foreground\` / \`text-primary-foreground\` / \`text-destructive-foreground\` / \`text-success-foreground\` (each pairs with its matching \`bg-*\`).
  - Signal text: \`text-primary\` (highlight), \`text-success\`, \`text-destructive\`, \`text-destructive-bright\`, \`text-success-bright\`.
  - Domain-only text (see "Domain signal tokens" below): \`text-user\`, \`text-llm\` (+ \`text-llm-foreground\`), \`text-tool\`, \`text-subagent\`.
- Borders / rings: \`border-border\`, \`border-input\`, \`ring-ring\`.
- HARD RULE: NEVER use a surface DEFAULT as a TEXT colour. \`text-card\`, \`text-popover\`, \`text-secondary\`, \`text-muted\`, \`text-accent\` are all dark surface fills and will be invisible on a dark background. Use the matching \`*-foreground\` for text and reserve the bare name for \`bg-*\` / \`border-*\`.

Surfaces (recipes)
- Root container: \`w-full min-h-full p-4 text-sm text-foreground bg-background\` (use \`min-h-full\`, NOT \`h-full\`, so taller content can scroll vertically)
- Cards / panels: \`rounded-md border border-border bg-card text-card-foreground p-3\`
- Popovers / floating surfaces: \`rounded-md border border-border bg-popover text-popover-foreground\`
- Subtle inset surfaces (nested rows, kv-style blocks): \`bg-secondary text-secondary-foreground\`
- Muted surfaces (hovered rows, side panels): \`bg-muted text-muted-foreground\`
- Accent surfaces (for selected items): \`bg-accent text-accent-foreground\`

Text
- Section headings: \`text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2\`
- Labels: \`text-xs text-muted-foreground\`
- Values: \`text-sm text-foreground\`
- Code / ids / JSON / numbers: \`font-mono text-xs text-foreground\`
- Inline JSON / quoted-reference text: \`text-secondary-foreground\` (one notch below \`text-foreground\`)
- Secondary / de-emphasised: \`text-muted-foreground\` or \`text-secondary-foreground\`
- Use ONLY Tailwind's named scale: \`text-xs\` (12px) and \`text-sm\` (14px) cover 99% of cases; \`text-base\` for emphasised values, \`text-lg\` only for hero numbers. NEVER write arbitrary pixel sizes like \`text-[10px]\` — they look broken next to the rest of the platform.

Domain signal tokens — RESERVED for LLM / agent content. Do NOT use these for generic styling, decoration, or to introduce visual variety. Their meaning is structural; using them on unrelated content (e.g. a JSON key, a generic label, a metadata row) misleads the reader.
- \`text-user\` / \`bg-user\` — ONLY for user / human input content (role: "user" chat messages, the user's prompt, trace "input" markers). This is the same blue Laminar uses to mark user input across the platform.
- \`text-llm\` / \`bg-llm\` — ONLY for assistant / model-generated content (a chat bubble with role: "assistant", an LLM-output span header). Never on user content, never on generic JSON.
- \`text-tool\` / \`bg-tool\` — ONLY for tool / function-call content (role: "tool" messages, tool-call span headers, the name of the tool that ran).
- \`text-subagent\` / \`bg-subagent\` — ONLY for nested agent / subagent identification (a span whose kind is "subagent", an agent-handoff marker).
- If the input does NOT contain chat messages, tool calls, or agent spans, do NOT use \`user\` / \`llm\` / \`tool\` / \`subagent\` colours at all. Lean on \`text-foreground\` / \`text-secondary-foreground\` / \`text-muted-foreground\` / \`text-primary\` for the whole template.

Generic signal tokens (safe to use anywhere their semantics apply)
- \`text-primary\` — key highlights, CTA accents (orange brand colour — NOT for user content; use \`text-user\` instead)
- \`text-success\` — successful states, passing checks, completed work
- \`text-destructive\` — errors, failures, blocking conditions
- \`text-muted-foreground\` — system messages, less-important metadata, empty states

Role / category colour mapping (apply ONLY when rendering chat messages / span lists):
- \`user\` → user  ·  \`assistant\` → llm  ·  \`tool\` → tool  ·  \`subagent\` → subagent  ·  \`system\` → muted-foreground

For status / role / category labels, use plain coloured uppercase text (\`text-xs font-medium uppercase tracking-wide text-<accent>\`) — NOT pills, badges, dots, or chips. The colour already carries the signal.
DO NOT render decorative dot indicators (\`<span className="size-1.5 rounded-full bg-..." />\`) or bordered pill wrappers around labels. Keep labels as text only.
DO NOT use \`bg-<accent>/15 text-<accent>\` either — same-hue text on tinted background fails contrast for desaturated tokens.

Layout / density
- Keep paddings tight: \`p-2\` / \`p-3\` on cards, \`gap-2\` / \`gap-3\` between rows
- Avoid \`p-6\`, \`text-lg\`, \`rounded-xl\`, colourful gradients, glow shadows — they don't fit Laminar's compact UI
- Favour grids and aligned columns over hero layouts
- No external images, icons, fonts, or fetched resources. Use Unicode glyphs (\`•\`, \`↗\`, \`✓\`, \`✕\`, \`→\`) when a marker is needed
- Separators: \`border-t border-border\` (prefer whitespace over heavy dividers)

Formatting primitives (apply uniformly)
- Long string values must use \`truncate\` or \`break-all\` (depending on whether they're ids vs prose) so they never blow out the layout horizontally.
- For lists / arrays, render an empty-state when the array is empty or missing: \`<div className="text-xs text-muted-foreground italic">No items</div>\`. Never render an empty card with no rows.
- For unknown / nullish primitive values, render an em-dash \`—\` in \`text-muted-foreground\` rather than the strings "undefined" or "null".
- Numbers: format with thousands separators (\`Number(n).toLocaleString()\`) and units when known (\`ms\`, \`s\`, \`tokens\`, \`$\`). Durations in ms below 1000 should display as \`Xms\`, above as \`X.YYs\`. Costs as \`$X.XXXX\` (4 decimals for sub-cent precision).
- Booleans: render as \`✓\` / \`✕\` glyphs with \`text-success\` / \`text-muted-foreground\` rather than the literal words "true"/"false", unless context demands otherwise.
- Timestamps / dates: if the input looks like ISO 8601 or a unix epoch, format with \`new Date(value).toLocaleString()\`. Show the raw value in a \`title\` tooltip for precision.

Structure
- The root container ALWAYS sets: \`w-full min-h-full p-4 bg-background text-foreground\`. Never \`p-0\`, never \`h-full\` (use \`min-h-full\` so taller content can grow and scroll), never \`overflow-hidden\` on the root.
- Wrap the entire UI in ONE card by default (\`rounded-md border border-border bg-card p-3\`). Multiple distinct sections → \`flex flex-col gap-3\` of cards. NEVER nest cards more than two deep.
- Whenever you map over an array, give each child a stable \`key\` derived from the item (id, name, index as a last resort).
</laminar_ui_style_guide>`;

const OUTPUT_CONTRACT = `<output_contract>
Return the template wrapped in a SINGLE fenced \`\`\`jsx code block — no prose before or after, no second code block, no commentary. The fenced block makes it copy-pasteable from a chat UI and prevents the backticks inside template literals from breaking the chat's markdown renderer.

The contents of the code block must be exactly this shape:

function({ data }) {
  return (
    <div className="w-full min-h-full p-4 text-sm text-foreground bg-background">
      {/* JSX here */}
    </div>
  );
}

Hard rules:
- Use HTML/JSX syntax (no TypeScript, no imports, no exports).
- The function receives a single argument \`{ data }\`. Always destructure as \`function({ data })\`.
- Return ONE root JSX element. Use Tailwind classes via \`className\`.
- Prefer pure, static JSX. Templates are small and re-render cheaply, so memoization and side effects add noise without value. Reach for \`useState\` ONLY when the UI is genuinely interactive (e.g. an expand/collapse toggle, a tab switcher). \`useState\` is in scope and may be used in that case. Do NOT use \`useEffect\`, \`useMemo\`, \`useCallback\`, \`useRef\`, or \`useContext\` — they are unnecessary for rendering JSON. Do NOT import any hook.
- \`Fragment\` is in scope. When rendering siblings in a list, give each iteration a stable \`key\` (e.g. \`<Fragment key={...}>\`). Never emit \`<>\`/\`</>\` inside an \`Array.map\` — bare fragments cannot carry a key.
- You may use \`JSON.stringify\`, \`Array.isArray\`, \`Object.entries\`, \`Object.keys\`, \`String\`, \`Number\`, \`Boolean\`.
- Be defensive: \`data\` may be \`undefined\`, \`null\`, a primitive, an array, or an object. Guard every access (\`data?.foo\`, \`Array.isArray(data) ? data : []\`).
- Do NOT call \`fetch\`, \`XMLHttpRequest\`, \`WebSocket\`, \`EventSource\`, \`navigator.sendBeacon\`, \`window.open\`, \`document.cookie\`, \`localStorage\`, or any other I/O API. They are blocked in the sandbox and will throw.
- Do NOT reference external URLs, \`<script>\`, \`<iframe>\`, \`<style>\`, \`<link>\`, inline event handlers on strings, or \`dangerouslySetInnerHTML\`.
- Do NOT use \`import\`, \`require\`, \`eval\`, \`new Function\`, or top-level \`await\`.
</output_contract>`;

const INTRO = `You are generating a JSX template for Laminar, an open-source observability platform for AI agents. The template renders a JSON payload inside a sandboxed iframe using Preact + Tailwind, with Tailwind wired to Laminar's semantic design tokens.

Read the style guide and output contract below, then produce ONE JSX template function for the data and request at the bottom. Reply with the function wrapped in a single \`\`\`jsx fenced code block and nothing else.`;

const DATA_PLACEHOLDER = `// Paste a sample of the JSON payload your template will receive as \`data\`.
{ "example": "replace me" }`;

const WHAT_TO_RENDER = `<what_to_render>
// Describe what you want the template to show.
// Example: "Render the messages array as a chat conversation with role-coloured headers."
</what_to_render>`;

export const buildRenderTemplatePrompt = (testData?: string): string => {
  const trimmed = testData?.trim();
  const dataBlock = `<your_data>\n${trimmed && trimmed.length > 0 ? trimmed : DATA_PLACEHOLDER}\n</your_data>`;

  return `${INTRO}

${STYLE_GUIDE}

${OUTPUT_CONTRACT}

${dataBlock}

${WHAT_TO_RENDER}`;
};
