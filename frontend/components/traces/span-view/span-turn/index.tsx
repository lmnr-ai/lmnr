import { memo, useCallback, useMemo, useState } from "react";

import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { buildSpanTurn } from "@/lib/spans/turn";
import { type Span } from "@/lib/traces/types";

import { buildRows, type MessageAnchor } from "./build-rows";
import ConversationList from "./conversation-list";
import { anchorHash, isFoldedAnchor, parseAnchorHash } from "./message-anchor";
import { useSectionFormats } from "./use-section-formats";

const readAnchorHash = () => (typeof window === "undefined" ? undefined : parseAnchorHash(window.location.hash));

/** `linkable`: offer per-message links (off where the URL can't reopen this span). */
const PureSpanTurn = ({ span, linkable = false }: { span: Span; linkable?: boolean }) => {
  const turn = useMemo(() => buildSpanTurn(span.input, span.output), [span.input, span.output]);
  const [linked, setLinked] = useState<MessageAnchor | undefined>(() => (linkable ? readAnchorHash() : undefined));

  // Folded context can't be searched (or linked to), so a search term or a link into it opens it.
  const searchTerm = useSpanSearchState()?.searchTerm ?? "";
  const [contextOpen, setContextOpen] = useState(
    () => searchTerm.length > 0 || (!!linked && isFoldedAnchor(turn, linked))
  );
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm) setContextOpen(true);
  }
  const toggleContext = useCallback(() => setContextOpen((open) => !open), []);

  const linkMessage = useCallback(
    (anchor: MessageAnchor) => {
      const url = new URL(window.location.href);
      url.searchParams.set("spanId", span.spanId);
      url.hash = anchorHash(anchor);
      window.history.replaceState(null, "", url);
      setLinked(anchor);
      return navigator.clipboard.writeText(url.toString());
    },
    [span.spanId]
  );

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const pathKey = (typeof spanPath === "string" ? spanPath.split(".") : spanPath).join(".");
  const formats = useSectionFormats(span, turn, pathKey);

  const rawInput = formats.input.mode !== "messages";
  const rawOutput = formats.output.mode !== "messages";
  const rows = useMemo(
    () => buildRows(turn, contextOpen, { input: rawInput, output: rawOutput }),
    [turn, contextOpen, rawInput, rawOutput]
  );

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
        />
      )}
    </div>
  );
};

const SpanTurn = memo(PureSpanTurn);

export default SpanTurn;
