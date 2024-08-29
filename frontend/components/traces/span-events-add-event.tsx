
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useState } from "react";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";

interface SpanEventsAddEventProps {
  spanId: string;
  onEventCreate: () => void
}

export default function SpanEventsAddEvent({ spanId, onEventCreate }: SpanEventsAddEventProps) {
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string | null>(null);
  const [newEventTypeName, setNewEventTypeName] = useState<string>('');  // New event type name is added per project
  const [newEventValue, setNewEventValue] = useState<string>('');  // either number (as string) or string

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { projectId } = useProjectContext();
  const { toast } = useToast();

  const addEvent = async () => {
    setIsLoading(true);

    const eventTypeId = selectedEventTypeId;


    const res = await fetch(`/api/projects/${projectId}/trace-events/update`, {
      method: 'POST',
      body: JSON.stringify({
        spanId,
        value: newEventValue,  // expect value to be non-null
        typeId: eventTypeId
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (res.status != 200) {
      toast({
        title: 'There was an error when adding the event',
        variant: 'destructive'
      })
    }

    onEventCreate();

    setIsLoading(false);
    setIsPopoverOpen(false);
  }

  return (
    <Popover
      modal={false}
      open={isPopoverOpen}
      onOpenChange={(open) => {
        setIsPopoverOpen(open)
        setSelectedEventTypeId(null)
        setNewEventTypeName('')
        setNewEventValue('')
      }}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
        >
          Add event
        </Button>
      </PopoverTrigger>
      <PopoverContent side='bottom' className="max-h-96 overflow-y-auto ml-72 w-96">
        <div className="flex flex-col space-y-2 items-start p-1">
          <h1 className="font-bold text-lg">Add new event</h1>
          <Label>event</Label>
          {/* <SelectEvent onEventTypeIdChange={setSelectedEventTypeId} /> */}
          <Label>Value</Label>
          <Input
            placeholder="Enter value"
            onChange={(e) => {
              setNewEventValue(e.target.value)
            }}
            spellCheck={false}
          />
          <div className="flex w-full justify-end">
            <Button
              variant={'secondary'}
              onClick={() => { addEvent() }}
              disabled={isLoading || ((selectedEventTypeId === null) && newEventTypeName === '') || !newEventValue}
              handleEnter
            >
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
