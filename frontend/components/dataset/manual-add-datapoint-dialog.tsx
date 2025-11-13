import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useState } from "react";

import { theme } from "@/components/ui/content-renderer/utils";
import { Label } from "@/components/ui/label.tsx";
import { isValidJsonObject } from "@/lib/utils";

import { useToast } from "../../lib/hooks/use-toast";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

const DEFAULT_DATA = '{\n  "data": {},\n  "target": {}\n}';

interface TypeDatapointDialogProps {
  datasetId: string;
  onUpdate?: () => void;
}

// Dialog to add a single datapoint to a dataset by manually typing
export default function ManualAddDatapointDialog({ datasetId, onUpdate }: TypeDatapointDialogProps) {
  const { projectId } = useParams();
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
        <Button icon="rows2" variant="secondary">
          Add row
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create datapoint</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Fill in datapoint in JSON format.</Label>
          <div className="border rounded-md bg-muted/50 overflow-hidden min-h-48 max-h-96">
            <CodeMirror
              height="100%"
              className="h-full"
              value={data}
              onChange={setData}
              extensions={[json(), EditorView.lineWrapping]}
              theme={theme}
            />
          </div>
        </div>
        {!isValidJson() && (
          <div className="text-red-500">
            Please enter a valid JSON map that has a {'"'}data{'"'} key.
          </div>
        )}
        <DialogFooter>
          <Button disabled={isLoading || !isValidJson()} onClick={async () => await addDatapoint()}>
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
