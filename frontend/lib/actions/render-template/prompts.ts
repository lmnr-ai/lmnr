// Self-contained prompt the user copies into their own AI tool to generate a
// Laminar render template. Three things only: how to style it (Laminar tokens),
// what code shape to return (function({ data }) JSX), and a slot for the
// user's data + request.

const STYLE_GUIDE = `<laminar_ui_style_guide>
Laminar uses Tailwind CSS with a dark-first palette and a small, dense, monospace-leaning UI.
The iframe's Tailwind theme is pre-wired with Laminar's semantic tokens — use these class names
(\`bg-card\`, \`text-foreground\`, etc.) instead of raw palette names so the template stays
on-theme.

Tokens (these all work; nothing else is wired)
- Surfaces — use as \`bg-<name>\` with \`text-<name>-foreground\` for the contrast text on top:
  background · card · popover · primary · secondary · muted · accent · destructive · success
- Plain text colours — use on top of any surface:
  \`text-foreground\` (default body), \`text-secondary-foreground\` (one notch down), \`text-muted-foreground\` (de-emphasised), \`text-card-foreground\` / \`text-popover-foreground\` / \`text-accent-foreground\` / \`text-primary-foreground\` / \`text-destructive-foreground\` / \`text-success-foreground\` (each pairs with its matching \`bg-*\`).
- Signal text (use freely where the semantics fit): \`text-primary\` (highlight / brand accent), \`text-success\`, \`text-success-bright\`, \`text-destructive\`, \`text-destructive-bright\`.
- Domain accents — RESERVED for the matching content kind. Don't use them for generic styling:
  - \`text-user\` / \`bg-user\` — user / human input (role: "user", input markers).
  - \`text-llm\` / \`bg-llm\` — assistant / model output (role: "assistant", LLM span headers). Also has \`text-llm-foreground\`.
  - \`text-tool\` / \`bg-tool\` — tool / function-call content (role: "tool", tool-call span headers).
  - \`text-subagent\` / \`bg-subagent\` — nested agent / subagent identification.
- Borders / rings: \`border-border\`, \`border-input\`, \`ring-ring\`.

Role → colour mapping (when rendering chat-style messages or span lists):
\`user\` → user · \`assistant\` → llm · \`tool\` → tool · \`subagent\` → subagent · \`system\` → muted-foreground.

Surface recipes
- Root container: \`w-full min-h-full p-4 text-sm text-foreground bg-background\` (use \`min-h-full\`, never \`h-full\`, so taller content can scroll)
- Card / panel: \`rounded-md border border-border bg-card text-card-foreground p-3\`
- Popover / floating: \`rounded-md border border-border bg-popover text-popover-foreground\`
- Subtle inset row / kv block: \`bg-secondary text-secondary-foreground\`
- Hovered or side-panel inset: \`bg-muted text-muted-foreground\`
- Selected / highlighted item: \`bg-accent text-accent-foreground\`

Text recipes
- Section heading: \`text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2\`
- Label: \`text-xs text-muted-foreground\`
- Value: \`text-sm text-foreground\`
- Code / ids / JSON / numbers: \`font-mono text-xs text-foreground\`
- Inline JSON / quoted text: \`text-secondary-foreground\`
- Stick to Tailwind's named scale: \`text-xs\` / \`text-sm\` cover almost everything; \`text-base\` for emphasised values, \`text-lg\` for hero numbers only. Avoid arbitrary pixel sizes (\`text-[10px]\`).

Layout / density
- Tight padding (\`p-2\` / \`p-3\` on cards, \`gap-2\` / \`gap-3\` between rows). Skip \`p-6\`, \`rounded-xl\`, gradients, glow shadows — they don't fit Laminar's compact UI.
- Favour grids and aligned columns over hero layouts.
- No external images, icons, fonts, or fetched resources. Use Unicode glyphs (\`•\`, \`↗\`, \`✓\`, \`✕\`, \`→\`) when a marker is needed.
- Separators: \`border-t border-border\`. Prefer whitespace over heavy dividers.

Labels & badges
- For status / role / category labels, use plain coloured uppercase text (\`text-xs font-medium uppercase tracking-wide text-<accent>\`). The colour carries the signal — don't wrap in pills, chips, or dots, and don't pair \`bg-<accent>/15\` with same-hue text (low contrast).

Formatting primitives
- Long strings: \`truncate\` for ids, \`break-all\` for prose — never let values blow out the layout.
- Empty arrays / missing lists: render \`<div className="text-xs text-muted-foreground italic">No items</div>\` instead of a blank card.
- Null / undefined primitives: show \`—\` in \`text-muted-foreground\`, never the literal "undefined" / "null".
- Numbers: \`Number(n).toLocaleString()\`, with units (\`ms\`, \`s\`, \`tokens\`, \`$\`) where appropriate. Durations < 1000 ms → \`Xms\`; otherwise \`X.YYs\`. Costs → \`$X.XXXX\` (4 decimals).
- Booleans: render \`✓\` / \`✕\` in \`text-success\` / \`text-muted-foreground\` rather than the words "true" / "false".
- Timestamps / ISO strings / epoch ints: \`new Date(value).toLocaleString()\`, with the raw value in a \`title\` tooltip.

Structure
- The root container ALWAYS uses \`w-full min-h-full p-4 bg-background text-foreground\`. Don't use \`p-0\`, \`h-full\`, or \`overflow-hidden\` on the root.
- Wrap everything in ONE card by default (\`rounded-md border border-border bg-card p-3\`). For multiple distinct sections, use \`flex flex-col gap-3\` of cards. Don't nest cards more than two deep.
- When mapping over arrays, give each child a stable \`key\` (id, name, or index as a last resort).

Footgun (this one really matters): the surface-DEFAULT tokens \`text-card\`, \`text-popover\`, \`text-secondary\`, \`text-muted\`, \`text-accent\` are dark fills, NOT text colours — they'll be invisible on a dark background. For text, always use the matching \`text-*-foreground\`; reserve the bare name for \`bg-*\` / \`border-*\`.
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
