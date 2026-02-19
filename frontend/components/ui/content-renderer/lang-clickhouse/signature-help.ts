import { syntaxTree } from "@codemirror/language";
import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import { showTooltip, type Tooltip as TooltipType } from "@codemirror/view";

import { getFunctionSignature } from "./function-signatures";
import type { FunctionCallContext, FunctionSignature } from "./types";

export function isInsideString(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, -1);
  return node.name === "String" || node.name === "QuotedString" || node.name === "Literal";
}

function getFunctionCallContext(state: EditorState, pos: number): FunctionCallContext | null {
  if (isInsideString(state, pos)) {
    return null;
  }

  const doc = state.doc;
  const text = doc.sliceString(Math.max(0, pos - 500), pos);

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

  const beforeParen = text.slice(0, lastOpenParen).trimEnd();
  const functionNameMatch = beforeParen.match(/(\w+)\s*$/);

  if (!functionNameMatch) {
    return null;
  }

  const functionName = functionNameMatch[1];
  const textOffset = Math.max(0, pos - 500);
  const functionNameStartInText = beforeParen.length - functionNameMatch[1].length;
  const functionStart = textOffset + functionNameStartInText;

  return {
    functionName,
    parameterIndex: commaCount,
    start: functionStart,
    end: pos,
  };
}

function formatSignature(sig: FunctionSignature, currentParam: number): HTMLElement {
  const container = document.createElement("div");
  container.className = "signature-help";

  const nameSpan = document.createElement("span");
  nameSpan.className = "signature-function-name";
  nameSpan.textContent = sig.name;
  container.appendChild(nameSpan);

  const openParen = document.createElement("span");
  openParen.textContent = "(";
  container.appendChild(openParen);

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

  const returnType = document.createElement("span");
  returnType.className = "signature-return-type";
  returnType.textContent = ` → ${sig.returnType}`;
  container.appendChild(returnType);

  const desc = document.createElement("div");
  desc.className = "signature-description";
  desc.textContent = sig.description;
  container.appendChild(desc);

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

export const setSignatureTooltip = StateEffect.define<FunctionCallContext | null>();

const signatureTooltipField = StateField.define<FunctionCallContext | null>({
  create(state) {
    const pos = state.selection.main.head;
    return getFunctionCallContext(state, pos);
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSignatureTooltip)) {
        return effect.value;
      }
    }

    if (tr.selection || tr.docChanged) {
      const pos = tr.state.selection.main.head;
      return getFunctionCallContext(tr.state, pos);
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

      if (context.start < 0 || context.end < 0 || context.start > context.end) {
        return null;
      }

      const tooltip: TooltipType = {
        pos: context.end,
        above: true,
        strictSide: false,
        arrow: true,
        create: () => {
          const dom = formatSignature(signature, context.parameterIndex);
          return { dom };
        },
      };

      return tooltip;
    }),
});

export const signatureHelp = [signatureTooltipField];
