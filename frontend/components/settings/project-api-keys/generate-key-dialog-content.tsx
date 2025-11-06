import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "../../ui/button";
import { DialogFooter } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";

interface GenerateKeyDialogContentProps {
  onClick: () => void;
  onNameChange: (name: string) => void;
  keyType: "default" | "ingest_only";
  onKeyTypeChange: (type: "default" | "ingest_only") => void;
  isLoading: boolean;
}

export function GenerateKeyDialogContent({
  onClick,
  isLoading,
  onNameChange,
  keyType,
  onKeyTypeChange,
}: GenerateKeyDialogContentProps) {
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-sm">Name</Label>
          <Input autoFocus placeholder="API key name" onChange={(e) => onNameChange(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <Label className="text-sm">Key Type</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoCircledIcon className="h-3 w-3 text-muted-foreground cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="max-w-xs">
                    Ingest-only keys can write trace data but cannot access any other project data
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select value={keyType} onValueChange={(value) => onKeyTypeChange(value as "default" | "ingest_only")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="ingest_only">Ingest Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onClick} handleEnter disabled={isLoading}>
          <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
          Create
        </Button>
      </DialogFooter>
    </>
  );
}
