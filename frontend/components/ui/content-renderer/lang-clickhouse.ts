import { SQLDialect } from "@codemirror/lang-sql";
import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  showTooltip,
  type Tooltip as TooltipType,
  ViewPlugin,
} from "@codemirror/view";

import { clickhouseFunctionSignatures, type FunctionSignature, getFunctionSignature } from "./clickhouse-signatures";

const clickhouseFunctions = Object.values(clickhouseFunctionSignatures).map((sig) => ({
  name: sig.name,
  description: sig.description,
}));

const clickhouseFunctionNamesSet = new Set(clickhouseFunctions.map((fn) => fn.name.toLowerCase()));

const clickhouseFunctionNames = clickhouseFunctions.map((fn) => fn.name).join(" ");

const ClickHouseDialect = SQLDialect.define({
  builtin: clickhouseFunctionNames,
  types:
    "Int8 Int16 Int32 Int64 Int128 Int256 UInt8 UInt16 UInt32 UInt64 UInt128 UInt256 " +
    "Float32 Float64 Decimal Decimal32 Decimal64 Decimal128 Decimal256 " +
    "String FixedString UUID Date Date32 DateTime DateTime64 " +
    "Array Tuple Map Nested Enum Enum8 Enum16 " +
    "IPv4 IPv6 LowCardinality Nullable AggregateFunction SimpleAggregateFunction",
  backslashEscapes: true,
  doubleQuotedStrings: false,
  hashComments: false,
});

const functionDecoration = Decoration.mark({ class: "cm-sql-function" });
const knownIdentifierDecoration = Decoration.mark({ class: "cm-sql-known-identifier" });
const unknownIdentifierDecoration = Decoration.mark({ class: "cm-sql-unknown-identifier" });

/**
 * Creates a syntax highlighter for ClickHouse identifiers.
 * Accepts a set of known identifiers (tables/columns) to highlight differently.
 */
function createIdentifierHighlighter(knownIdentifiers: Set<string>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: { view: EditorView; docChanged: boolean; viewportChanged: boolean }) {
        // Only rebuild if document changed or viewport changed significantly
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const tree = syntaxTree(view.state);

        // Only process visible ranges for better performance
        const { from, to } = view.viewport;
        const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];

        tree.iterate({
          from,
          to,
          enter: (node) => {
            // Look for identifiers
            if (node.name === "Identifier" || node.name === "VariableName" || node.name === "Name") {
              const text = doc.sliceString(node.from, node.to);
              const lowerText = text.toLowerCase();
              const nextChar = doc.sliceString(node.to, node.to + 1);

              let decoration: Decoration;

              // Check if it's a function call (followed by '(')
              if (nextChar === "(" && clickhouseFunctionNamesSet.has(lowerText)) {
                decoration = functionDecoration;
              }
              // Check if it's a known table/column
              else if (knownIdentifiers.has(lowerText)) {
                decoration = knownIdentifierDecoration;
              }
              // Unknown identifier
              else {
                decoration = unknownIdentifierDecoration;
              }

              ranges.push({ from: node.from, to: node.to, decoration });
            }
          },
        });

        // Sort ranges by position and add them to the builder
        ranges.sort((a, b) => a.from - b.from);
        for (const { from, to, decoration } of ranges) {
          builder.add(from, to, decoration);
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

// Signature Help Implementation

interface FunctionCallContext {
  functionName: string;
  parameterIndex: number;
  start: number;
  end: number;
}

/**
 * Checks if the position is inside a string literal
 */
function isInsideString(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, -1);

  const isString = node.name === "String" || node.name === "QuotedString" || node.name === "Literal";

  return isString;
}

/**
 * Finds the function call context at the cursor position
 */
function getFunctionCallContext(state: EditorState, pos: number): FunctionCallContext | null {
  // Don't show signature help inside strings
  if (isInsideString(state, pos)) {
    return null;
  }

  const doc = state.doc;
  const text = doc.sliceString(Math.max(0, pos - 500), pos);

  // Find the last opening parenthesis
  let parenDepth = 0;
  let lastOpenParen = -1;
  let commaCount = 0;

  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];

    if (char === ")") {
      parenDepth++;
    } else if (char === "(") {
      if (parenDepth === 0) {
        lastOpenParen = i;
        break;
      }
      parenDepth--;
    } else if (char === "," && parenDepth === 0) {
      commaCount++;
    }
  }

  if (lastOpenParen === -1) {
    return null;
  }

  // Find function name before the opening paren
  const beforeParen = text.slice(0, lastOpenParen).trimEnd();
  const functionNameMatch = beforeParen.match(/(\w+)\s*$/);

  if (!functionNameMatch) {
    return null;
  }

  const functionName = functionNameMatch[1];

  // Calculate the absolute position of the function name start
  const textOffset = Math.max(0, pos - 500);
  const functionNameStartInText = beforeParen.length - functionNameMatch[1].length;
  const functionStart = textOffset + functionNameStartInText;

  // The opening paren position in absolute terms
  const openParenPos = textOffset + lastOpenParen;

  return {
    functionName,
    parameterIndex: commaCount,
    start: functionStart,
    end: pos,
  };
}

/**
 * Formats a function signature with the current parameter highlighted
 */
function formatSignature(sig: FunctionSignature, currentParam: number): HTMLElement {
  const container = document.createElement("div");
  container.className = "signature-help";

  // Function name and opening paren
  const nameSpan = document.createElement("span");
  nameSpan.className = "signature-function-name";
  nameSpan.textContent = sig.name;
  container.appendChild(nameSpan);

  const openParen = document.createElement("span");
  openParen.textContent = "(";
  container.appendChild(openParen);

  // Parameters
  sig.parameters.forEach((param, index) => {
    if (index > 0) {
      const comma = document.createElement("span");
      comma.textContent = ", ";
      container.appendChild(comma);
    }

    const paramSpan = document.createElement("span");
    paramSpan.className = index === currentParam ? "signature-param-current" : "signature-param";

    const paramText = param.optional ? `[${param.name}]` : param.name;
    paramSpan.textContent = paramText;

    container.appendChild(paramSpan);
  });

  const closeParen = document.createElement("span");
  closeParen.textContent = ")";
  container.appendChild(closeParen);

  // Return type
  const returnType = document.createElement("span");
  returnType.className = "signature-return-type";
  returnType.textContent = ` → ${sig.returnType}`;
  container.appendChild(returnType);

  // Description
  const desc = document.createElement("div");
  desc.className = "signature-description";
  desc.textContent = sig.description;
  container.appendChild(desc);

  // Current parameter details
  if (currentParam < sig.parameters.length) {
    const currentParamInfo = sig.parameters[currentParam];
    const paramDetails = document.createElement("div");
    paramDetails.className = "signature-param-details";

    const paramName = document.createElement("strong");
    paramName.textContent = currentParamInfo.name;
    paramDetails.appendChild(paramName);

    const paramType = document.createElement("span");
    paramType.className = "signature-param-type";
    paramType.textContent = `: ${currentParamInfo.type}`;
    paramDetails.appendChild(paramType);

    const paramDesc = document.createElement("div");
    paramDesc.textContent = currentParamInfo.description;
    paramDetails.appendChild(paramDesc);

    container.appendChild(paramDetails);
  }

  return container;
}

/**
 * Creates the signature help tooltip that updates as you type
 */
const setSignatureTooltip = StateEffect.define<FunctionCallContext | null>();

const signatureTooltipField = StateField.define<FunctionCallContext | null>({
  create(state) {
    const pos = state.selection.main.head;
    const context = getFunctionCallContext(state, pos);
    return context;
  },
  update(value, tr) {
    // Check for explicit effects
    for (const effect of tr.effects) {
      if (effect.is(setSignatureTooltip)) {
        return effect.value;
      }
    }

    // Auto-update on cursor position change or document change
    if (tr.selection || tr.docChanged) {
      const pos = tr.state.selection.main.head;
      const context = getFunctionCallContext(tr.state, pos);

      return context;
    }

    return value;
  },
  provide: (field) =>
    showTooltip.from(field, (context) => {
      if (!context) {
        return null;
      }

      const signature = getFunctionSignature(context.functionName);
      if (!signature) {
        return null;
      }

      // Validate positions
      if (context.start < 0 || context.end < 0 || context.start > context.end) {
        return null;
      }

      const tooltip: TooltipType = {
        pos: context.end,
        above: true,
        strictSide: false,
        arrow: true,
        create: (view) => {
          const dom = formatSignature(signature, context.parameterIndex);
          return { dom };
        },
      };

      return tooltip;
    }),
});

const signatureHelp = [signatureTooltipField];

export {
  ClickHouseDialect,
  clickhouseFunctionNamesSet,
  clickhouseFunctions,
  createIdentifierHighlighter,
  signatureHelp,
};
