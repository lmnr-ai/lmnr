import { has, isEmpty } from "lodash";
import React, { useMemo } from "react";

import LangGraphViewer from "@/components/lang-graph";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { getLangGraphFromSpan } from "@/lib/lang-graph/utils";
import { Span } from "@/lib/traces/types";

interface LangGraphViewerProps {
  spans: Span[];
}
const LangGraphView = ({ spans }: LangGraphViewerProps) => {
  const { langGraphData, isEmptyLangGraph } = useMemo(() => {
    const span = spans.find(
      (s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)
    );

    if (span) {
      const data = getLangGraphFromSpan(span?.attributes);
      return {
        langGraphData: data,
        isEmptyLangGraph: isEmpty(data.edges) && isEmpty(data.nodes),
      };
    }
    return {
      langGraphData: {
        nodes: [],
        edges: [],
      },
      isEmptyLangGraph: true,
    };
  }, [spans]);

  return (
    <>
      <ResizableHandle className="z-50" withHandle />
      <ResizablePanel>
        <LangGraphViewer graphData={langGraphData} />
      </ResizablePanel>
    </>
  );
};

export default LangGraphView;
