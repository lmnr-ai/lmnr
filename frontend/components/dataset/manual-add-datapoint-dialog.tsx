import { Loader2, Rows2 } from "lucide-react";
import React, { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useProjectContext } from "@/contexts/project-context";
import { isValidJsonObject } from "@/lib/utils";

import { useToast } from "../../lib/hooks/use-toast";
import { Button } from "../ui/button";
import CodeEditor from "../ui/code-editor";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

const DEFAULT_DATA = '{\n  "data": {},\n  "target": {}\n}';

interface TypeDatapointDialogProps {
  datasetId: string;
  onUpdate?: () => void;
}

// Dialog to add a single datapoint to a dataset by manually typing
export default function ManualAddDatapointDialog({ datasetId, onUpdate }: TypeDatapointDialogProps) {
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState(DEFAULT_DATA);

  const isValidJson = useCallback(() => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.data === undefined) {
        return false;
      }
      if (parsed.metadata !== undefined && !isValidJsonObject(parsed.metadata)) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }, [data]);

  const showError = useCallback((message: string) => {
    toast({
      title: "Add datapoint error",
      variant: "destructive",
      description: message,
      duration: 10000,
    });
  }, []);

  const addDatapoint = async () => {
    setIsLoading(true);

    try {
      let res = await fetch(`/api/projects/${projectId}/datasets/${datasetId}/datapoints`, {
        method: "POST",
        body: JSON.stringify({
          datapoints: [JSON.parse(data)],
        }),
        cache: "no-cache",
      });

      if (res.status != 200) {
        showError((await res.json())["details"]);
        setIsLoading(false);
        return;
      }

      toast({
        title: "Successfully added datapoint",
      });

      onUpdate?.();
      setIsLoading(false);
      setIsDialogOpen(false);
    } catch (e) {
      showError("Please enter a valid JSON");
      setIsLoading(false);
      return;
    }
  };

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={() => {
        setIsDialogOpen(!isDialogOpen);
        setData(DEFAULT_DATA);
      }}
    >
      <DialogTrigger asChild>
        <Badge className="cursor-pointer py-1 px-2" variant="secondary">
          <Rows2 className="size-3 mr-2" />
          <span className="text-xs">Add row</span>
        </Badge>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New datapoint</DialogTitle>
        </DialogHeader>
        <span>{"Fill in datapoint in JSON format."}</span>
        <div className="border rounded-md max-h-[300px] overflow-y-auto">
          <CodeEditor value={data} onChange={setData} language="json" editable />
        </div>
        {!isValidJson() && (
          <div className="text-red-500">
            Please enter a valid JSON map that has a {'"'}data{'"'} key.
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button disabled={isLoading || !isValidJson()} onClick={async () => await addDatapoint()}>
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Add datapoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
