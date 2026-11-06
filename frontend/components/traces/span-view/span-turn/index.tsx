import { memo, useCallback, useMemo, useState } from "react";

import { spanPathKey } from "@/components/traces/span-view/span-io";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { useUrlState } from "@/components/traces/trace-view/store/base";
import { messageLinkUrl } from "@/components/traces/trace-view/trace-panel-url";
import { buildSpanTurn } from "@/lib/spans/turn";
import { type Span } from "@/lib/traces/types";

import { buildRows, type MessageAnchor } from "./build-rows";
import ConversationList from "./conversation-list";
import { anchorHash, isFoldedAnchor, parseAnchorHash } from "./message-anchor";
import { useSectionFormats } from "./use-section-formats";

const readAnchorHash = () => (typeof window === "undefined" ? undefined : parseAnchorHash(window.location.hash));

const PureSpanTurn = ({ span }: { span: Span }) => {
  // Message links only where the URL can reopen this span.
  const linkable = useUrlState();
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
      const url = messageLinkUrl(window.location.href, span.spanId, anchorHash(anchor));
      window.history.replaceState(null, "", url);
      setLinked(anchor);
      return navigator.clipboard.writeText(url.toString());
    },
    [span.spanId]
  );

  const pathKey = spanPathKey(span);
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
