import { memo, useCallback, useMemo, useState } from "react";

import { spanPathKey } from "@/components/traces/span-view/span-io";
import { useUrlState } from "@/components/traces/trace-view/store/base";
import { messageLinkUrl } from "@/components/traces/trace-view/trace-panel-url";
import { buildSpanTurn } from "@/lib/spans/turn";
import { type Span } from "@/lib/traces/types";

import { buildRows, type ConversationRow, hasContextFold, type MessageAnchor } from "./build-rows";
import ConversationList from "./conversation-list";
import { anchorHash, isFoldedAnchor, linkedAnchor } from "./message-anchor";
import { useSectionFormats } from "./use-section-formats";
import { useTurnSearch } from "./use-turn-search";

const readLinkedAnchor = (spanId: string) =>
  typeof window === "undefined" ? undefined : linkedAnchor(window.location.search, window.location.hash, spanId);

const PureSpanTurn = ({ span }: { span: Span }) => {
  // Message links only where the URL can reopen this span.
  const linkable = useUrlState();
  const turn = useMemo(() => buildSpanTurn(span.input, span.output), [span.input, span.output]);
  // Read once: copying a link later must not move the list.
  const [linked] = useState(() => (linkable ? readLinkedAnchor(span.spanId) : undefined));

  // A link into the folded context opens it.
  const [contextOpen, setContextOpen] = useState(() => !!linked && isFoldedAnchor(turn, linked));
  const toggleContext = useCallback(() => setContextOpen((open) => !open), []);

  const linkMessage = useCallback(
    (anchor: MessageAnchor) => {
      const url = messageLinkUrl(window.location.href, span.spanId, anchorHash(anchor));
      window.history.replaceState(null, "", url);
      return navigator.clipboard.writeText(url.toString());
    },
    [span.spanId]
  );

  const pathKey = spanPathKey(span);
  const formats = useSectionFormats(span, turn, pathKey);

  const rawInput = formats.input.mode !== "messages";
  const rawOutput = formats.output.mode !== "messages";
  const raw = useMemo(() => ({ input: rawInput, output: rawOutput }), [rawInput, rawOutput]);
  // Lazy: the full list normalizes every earlier message, which only an open context or a search needs.
  const allRows = useMemo(() => {
    let built: ConversationRow[] | undefined;
    return () => (built ??= buildRows(turn, true, raw));
  }, [turn, raw]);
  const folded = !contextOpen && !rawInput && hasContextFold(turn);
  const rows = useMemo(() => (folded ? buildRows(turn, false, raw) : allRows()), [folded, turn, raw, allRows]);

  const sections = useMemo(
    () => ({
      input: { mode: formats.input.mode, value: formats.input.value },
      output: { mode: formats.output.mode, value: formats.output.value },
    }),
    [formats.input.mode, formats.input.value, formats.output.mode, formats.output.value]
  );
  const search = useTurnSearch(allRows, sections);
  // Going to a match in the folded context opens it.
  const [prevActive, setPrevActive] = useState(search.active);
  if (search.active !== prevActive) {
    setPrevActive(search.active);
    if (search.activeInContext) setContextOpen(true);
  }

  const isEmpty = !turn.system && !turn.task && !turn.history && !turn.previous && !turn.input && !turn.output;

  return (
    <div className="relative size-full pt-2">
      {isEmpty ? (
        <div className="p-4 text-sm text-muted-foreground">No messages recorded for this span.</div>
      ) : (
        <ConversationList
          rows={rows}
          formats={formats}
          presetKey={`messages-${pathKey}`}
          onToggleContext={toggleContext}
          linked={linked}
          onLinkMessage={linkable ? linkMessage : undefined}
          matches={search.matches}
          activeMatch={search.active}
          contextHits={search.contextHits}
        />
      )}
    </div>
  );
};

const SpanTurn = memo(PureSpanTurn);

export default SpanTurn;
