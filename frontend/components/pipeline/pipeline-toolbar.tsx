import { type DragEvent } from 'react';
import { NodeType } from '@/lib/flow/types';
import { GripVertical, LogIn } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import NodePreviewComponent from './nodes/components/node-preview';
import { NODE_TYPE_TO_DOCS } from '@/lib/flow/utils';
import { NODE_PREVIEWS } from '@/lib/flow/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

export default function Toolbar({ editable }: { editable: boolean }) {

  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const nodeTypes = [
    { name: 'Input', type: NodeType.INPUT, group: 'IO', icon: LogIn },
    { name: 'Output', type: NodeType.OUTPUT, group: 'IO' },
    { name: 'String Template', type: NodeType.STRING_TEMPLATE, group: 'IO' },
    { name: 'JSON Extractor', type: NodeType.JSON_EXTRACTOR, group: 'IO' },
    { name: 'Switch', type: NodeType.SWITCH, group: 'Logic' },
    { name: 'Semantic Switch', type: NodeType.SEMANTIC_SWITCH, group: 'Logic' },
    { name: 'LLM', type: NodeType.LLM, group: 'LLM' },
    // { name: 'Code', type: NodeType.FUNCTION, group: 'Code' },
    { name: 'Semantic Search', type: NodeType.SEMANTIC_SEARCH, group: 'Search' },
    { name: 'Semantic Similarity', type: NodeType.SEMANTIC_SIMILARITY, group: 'Evaluation' },
  ];

  const uniqueGroups = Array.from(new Set(nodeTypes.map((nodeType) => nodeType.group)));

  return (
    <>
      <Accordion type="multiple" defaultValue={uniqueGroups}>
        {uniqueGroups.map((groupName, groupIndex) => (
          <AccordionItem className="px-2" key={groupIndex} value={groupName}>
            <AccordionTrigger className='py-2 text-secondary-foreground text-sm hover:no-underline'>{groupName}</AccordionTrigger>
            <AccordionContent className='flex flex-col pt-2 space-y-1'>
              {
                nodeTypes
                  .filter((nodeType) => nodeType.group === groupName)
                  .map((nodeType, i) => (
                    <TooltipProvider key={i} delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger>
                          <div
                            className="flex text-base text-foreground/80
                            items-center p-1 px-2 text-md border rounded cursor-grab hover:bg-secondary overflow-hidden"
                            onDragStart={(event) => {
                              onDragStart(event, nodeType.type);
                            }}
                            draggable={editable}
                          >
                            {nodeType.name}
                            <div className='flex-1' />
                            <GripVertical size={14} className='text-gray-400' />
                          </div>
                        </TooltipTrigger>
                        {NODE_PREVIEWS[nodeType.type] && (
                          <TooltipContent side="left" sideOffset={30}>
                            <NodePreviewComponent
                              name={nodeType.name}
                              description={NODE_PREVIEWS[nodeType.type]!.description}
                              imageSrc={NODE_PREVIEWS[nodeType.type]!.imageSrc}
                              documentationUrl={NODE_TYPE_TO_DOCS[nodeType.type]}
                            />
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  ))
              }
            </AccordionContent>
          </AccordionItem>

        ))}
      </Accordion>
    </>
  );
}
