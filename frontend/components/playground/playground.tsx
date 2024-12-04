'use client';
import { Loader2, PlayIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { v4 } from "uuid";

import { useProjectContext } from "@/contexts/project-context";
import { Graph, runGraph } from "@/lib/flow/graph";
import { LLMNode, NodeHandleType, NodeType } from "@/lib/flow/types";
import { createNodeData } from "@/lib/flow/utils";
import { Playground as PlaygroundType } from "@/lib/playground/types";
import { ChatMessage, ChatMessageContent } from "@/lib/types";

import LanguageModelSelect from "../pipeline/nodes/components/model-select";
import { Button } from "../ui/button";
import EditableChat from "../ui/editable-chat";
import Formatter from "../ui/formatter";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

const renderText = (text: string, inputs: Record<string, string>) =>
  text.replace(/\{\{([^}]+)\}\}/g, (match, p1) => inputs[p1] || match);

const renderChatMessageContent = (content: ChatMessageContent, inputs: Record<string, string>) => {
  if (typeof content === 'string') {
    return renderText(content, inputs);
  }

  for (const c of content) {
    if (c.type === 'text') {
      c.text = renderText(c.text, inputs);
    }
  }

  return content;
};

const renderChatMessages = (messages: ChatMessage[], inputs: Record<string, string>) => messages.map((m) => ({
  role: m.role,
  content: renderChatMessageContent(m.content, inputs)
}));

export default function Playground({ playground }: { playground: PlaygroundType }) {

  const { projectId } = useProjectContext();

  const [messages, setMessages] = useState<ChatMessage[]>(playground.promptMessages);
  const [modelId, setModelId] = useState<string>(playground.modelId !== '' ? playground.modelId : 'openai:gpt-4o-mini');

  const [inputs, setInputs] = useState<string>('{}');
  const [output, setOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    setIsUpdating(true);

    timer = setTimeout(() => {
      fetch(`/api/projects/${projectId}/playgrounds/${playground.id}`, {
        method: 'POST',
        body: JSON.stringify({
          promptMessages: messages,
          modelId,
        })
      })
        .then((res) => res.json())
        .then((data) => {
          console.log(data);
          setIsUpdating(false);
        });
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [messages, modelId, projectId, playground.id]);

  const run = async () => {
    setOutput('');
    setIsLoading(true);
    try {
      const node = createNodeData(v4(), NodeType.LLM) as LLMNode;
      node.model = modelId;
      node.dynamicInputs = Object.entries(JSON.parse(inputs)).map(([key, value]) => ({
        id: v4(),
        name: key,
        type: NodeHandleType.STRING
      }));
      node.inputs = [
        {
          id: v4(),
          name: 'chat_messages',
          type: NodeHandleType.CHAT_MESSAGE_LIST,
        }
      ];

      const graph = Graph.fromNode(node);

      const inputValues: Record<string, any> = JSON.parse(inputs);
      inputValues['chat_messages'] = renderChatMessages(messages, inputValues);

      const output = await runGraph(graph, inputValues, projectId);
      setOutput(output);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <Header path={`playgrounds/${playground.name}`}>
        {isUpdating && (
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        )}
      </Header>
      <ScrollArea className="flex-grow overflow-auto">
        <div className="max-h-0">
          <div className="">
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-2">
                <LanguageModelSelect
                  modelId={modelId}
                  onModelChange={(model) => {
                    setModelId(model.id);
                  }}
                />
                <EditableChat
                  messages={messages}
                  setMessages={(messages) => {
                    setMessages(messages);
                  }}
                />
              </div>
            </div>
            <div className="px-4">
              <Button
                onClick={run}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4 mr-1" />
                )}
                Run
              </Button>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="text-sm font-medium">Inputs</div>
                  <Formatter
                    value={inputs}
                    onChange={(value) => {
                      setInputs(value);
                    }}
                    editable={true}
                    defaultMode="json"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="text-sm font-medium">Output</div>
                  <Formatter
                    value={output}
                    editable={false}
                    defaultMode="json"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
