import { memo } from 'react'
import GenericNodeComponent from './generic-node'
import { type OutputNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventType } from '@/lib/events/types';

function capitalizeFirstLetter(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const OutputNodeComponent = ({ id, data }: { id: string, data: OutputNode }) => {
  const { updateNodeData } = useStore((state) => state);

  return (
    <GenericNodeComponent id={id} data={data}>
      <Label>Cast type (optional)</Label>
      <Select
        value={data.outputCastType ?? undefined}
        onValueChange={(value: string) => {
          if (value === "null") {
            updateNodeData(id, {
              outputCastType: null
            } as OutputNode);
            return;
          }

          const eventType = EventType[value as keyof typeof EventType];
          updateNodeData(id, {
            outputCastType: eventType
          } as OutputNode);
        }}
      >
        <SelectTrigger className="mb-4 h-8 w-full font-medium">
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem key={-1} value={"null"}>
            -
          </SelectItem>
          {
            Object.keys(EventType).map((eventType, i) => (
              <SelectItem key={i} value={eventType}>
                {capitalizeFirstLetter(eventType.toLowerCase())}
              </SelectItem>
            ))
          }
        </SelectContent>
      </Select>
    </GenericNodeComponent>
  )
}

export default memo(OutputNodeComponent)
