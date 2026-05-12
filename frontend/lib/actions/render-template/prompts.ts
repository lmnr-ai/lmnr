const STYLE_GUIDE = `<laminar_ui_style_guide>
Laminar uses Tailwind CSS with a dark-first palette and small, dense, monospace-leaning UI.
Follow these rules so generated templates visually match the platform:

- Root container: \`w-full h-full p-4 text-sm text-neutral-100 bg-neutral-950\`
- Card / panel surfaces: \`rounded-md border border-neutral-800 bg-neutral-900 p-3\`
- Section headings: \`text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2\`
- Labels: \`text-xs text-neutral-400\`
- Values: \`text-sm text-neutral-100\`; code / ids / JSON: \`font-mono text-xs text-neutral-200\`
- Muted / secondary text: \`text-neutral-500\`
- Primary accent: \`text-sky-400\` / \`bg-sky-500\` / \`border-sky-500\` (use sparingly for links, highlights, key numbers)
- Success: \`text-emerald-400\`; Warning: \`text-amber-400\`; Error / destructive: \`text-red-400\`
- Badges / chips: \`inline-flex items-center gap-1 rounded-sm border border-neutral-800 bg-neutral-800/60 px-1.5 py-0.5 text-[11px] text-neutral-300\`
- Separators: \`border-t border-neutral-800\` (no heavy dividers, prefer spacing)
- Grids / key-value layouts: \`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs\` with label in neutral-400 and value in neutral-100
- Spacing: keep paddings tight — \`p-2\` / \`p-3\` on cards, \`gap-2\` / \`gap-3\` between rows. Avoid \`p-6\`, \`text-lg\`, \`rounded-xl\`, colorful gradients or shadows.
- No external images, icons, fonts, or fetched resources. Use Unicode glyphs (\`•\`, \`↗\`, \`✓\`, \`✕\`) when a marker is needed.
- Assume a monospace-leaning display: favor grids, aligned columns, and compact cards over hero layouts.
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
  const statusColor = status === 'success'
    ? 'text-emerald-400'
    : status === 'error'
    ? 'text-red-400'
    : 'text-neutral-400';
  return (
    <div className="w-full h-full p-4 text-sm text-neutral-100 bg-neutral-950">
      <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">Trace</div>
          <span className={\`text-xs font-mono \${statusColor}\`}>{String(status)}</span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {entries.map(([key, value]) => (
            <>
              <div className="text-neutral-400">{key}</div>
              <div className="font-mono text-neutral-200 truncate">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </div>
            </>
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
You produce small JSX templates that render arbitrary JSON payloads inside a sandboxed iframe using Preact + Tailwind (via twind).

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
