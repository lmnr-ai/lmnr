import { useProjectContext } from "@/contexts/project-context";
import { useCallback, useState } from "react";
import { useToast } from '../../lib/hooks/use-toast'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import { Loader, Plus } from 'lucide-react';
import Ide from "../ui/ide";

const DEFAULT_DATA = '{\n  "data": {},\n  "target": {}\n}';

interface TypeDatapointDialogProps {
  datasetId: string;
  onUpdate?: () => void;
}

// Dialog to add a single datapoint to a dataset by manually typing
export default function ManualAddDatapointDialog({ datasetId, onUpdate }: TypeDatapointDialogProps) {
  const { projectId } = useProjectContext()
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState(DEFAULT_DATA); // Datapoint's "data" field

  const showError = useCallback((message: string) => {
    toast({ title: "Add datapoint error", variant: 'destructive', description: message, duration: 10000 })
  }, [])

  const addDatapoint = async () => {
    setIsLoading(true);

    try {

      let res = await fetch(
        `/api/projects/${projectId}/datasets/${datasetId}/datapoints`,
        {
          method: 'POST',
          body: JSON.stringify({
            datapoints: [JSON.parse(data)],
          }),
          cache: 'no-cache',
        })

      if (res.status != 200) {
        showError('Error adding datapoint');
        setIsLoading(false);
        return
      }

      toast({
        title: 'Successfully added datapoint'
      })

      onUpdate?.();
      setIsLoading(false);
      setIsDialogOpen(false);
    } catch (e) {
      showError('Please enter a valid JSON');
      setIsLoading(false);
      return
    }
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={() => {
      setIsDialogOpen(!isDialogOpen);
      setData(DEFAULT_DATA);
    }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
        >
          Add datapoint
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New datapoint</DialogTitle>
        </DialogHeader>
        <span>{'Fill in datapoint in JSON format.'}</span>
        <div className="h-80">
          <Ide value={data} onChange={setData} mode="json" />
        </div>
        <DialogFooter className='mt-4'>
          <Button
            disabled={isLoading}
            onClick={async () => await addDatapoint()}>
            {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
            Add datapoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}