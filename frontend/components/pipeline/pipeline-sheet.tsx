import useStore from '@/lib/flow/store';
import {
  CodeNode,
  GenericNode,
  JsonExtractorNode,
  LLMNode,
  NodeType,
  RouterNode,
  SemanticSearchNode,
  SemanticSwitchNode,
  StringTemplateNode,
  WebSearchNode
} from '@/lib/flow/types';

import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import CodeNodeComponent from './nodes/code';
import JsonExtractorNodeComponent from './nodes/json-extractor-node';
import LLM from './nodes/llm';
import SemanticSearchNodeComponent from './nodes/semantic-search-node';
import SemanticSwitchNodeComponent from './nodes/semantic-switch-node';
import StringTemplateNodeComponent from './nodes/string-template-node';
import SwitchNodeComponent from './nodes/switch-node';
import WebSearchNodeComponent from './nodes/web-search-node';

interface PipelineSheetProps {
  editable: boolean;
}

function RenderNode({
  data,
  editable
}: {
  data: GenericNode;
  editable: boolean;
}) {
  switch (data.type) {
  case NodeType.LLM:
    return <LLM data={data as LLMNode} editable={editable} />;
  case NodeType.SEMANTIC_SEARCH:
    return <SemanticSearchNodeComponent data={data as SemanticSearchNode} />;
  case NodeType.SWITCH:
    return <SwitchNodeComponent data={data as RouterNode} />;
  case NodeType.STRING_TEMPLATE:
    return <StringTemplateNodeComponent data={data as StringTemplateNode} />;
  case NodeType.SEMANTIC_SWITCH:
    return <SemanticSwitchNodeComponent data={data as SemanticSwitchNode} />;
  case NodeType.JSON_EXTRACTOR:
    return <JsonExtractorNodeComponent data={data as JsonExtractorNode} />;
  case NodeType.WEB_SEARCH:
    return <WebSearchNodeComponent data={data as WebSearchNode} />;
  case NodeType.CODE:
    return (
      <div className="p-0 w-full h-[300px] flex">
        <CodeNodeComponent data={data as CodeNode} />
      </div>
    );
  default:
    return null;
  }
}

export default function PipelineSheet({ editable }: PipelineSheetProps) {
  const { focusedNodeId, getNode, updateNodeData } = useStore((store) => store);

  const data = getNode(focusedNodeId ?? '')?.data;

  return (
    <div className="w-full h-full relative">
      {data && (
        <ScrollArea className="h-full w-full">
          <div className="max-h-0">
            <div className="flex flex-col p-4 space-y-2 bg-background pb-0">
              <Label>Node name</Label>
              <Input
                disabled={!editable}
                placeholder="Name of the node"
                value={data.name}
                onChange={(e) => {
                  updateNodeData(data.id, {
                    ...data,
                    name: e.currentTarget.value
                  });
                }}
                className="w-full"
              />
            </div>
            {!editable && data?.type !== NodeType.LLM && (
              <div className="absolute inset-0 z-50" />
            )}

            <RenderNode data={data} editable={editable} key={data.id} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
