import { useState } from "react";

import { envVarsToIconMap } from "@/components/playground/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnvVars } from "@/lib/env/utils";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

interface AddProviderApiKeyDialogProps {
  existingKeyNames: string[];
  onAdd: (name: string, value: string) => void;
}

export default function AddProviderApiKeyVarDialog({ existingKeyNames, onAdd }: AddProviderApiKeyDialogProps) {
  const [envVarType, setEnvVarType] = useState<string>("");
  const [envVarName, setEnvVarName] = useState<string>("");
  const [envVarValue, setEnvVarValue] = useState<string>("");

  return (
    <Dialog
      onOpenChange={() => {
        setEnvVarName("");
        setEnvVarType("");
        setEnvVarValue("");
      }}
    >
      <DialogTrigger asChild>
        <Button icon="plus" variant="outline" className="w-fit">
          API Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add API key</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Name</Label>
            <Select
              onValueChange={(value) => {
                setEnvVarType(value);
                if (value !== "custom") {
                  setEnvVarName(value);
                } else {
                  setEnvVarName("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="API key provider" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(EnvVars)
                  .filter((e) => !existingKeyNames.includes(e))
                  .map((v) => (
                    <SelectItem key={v} value={v}>
                      <span className="flex gap-2 items-center">
                        {envVarsToIconMap[v]}
                        {v}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {envVarType === "custom" && (
            <Input
              placeholder="Name"
              onChange={(e) => {
                setEnvVarName(e.target.value);
              }}
            />
          )}
          <div className="flex flex-col gap-2">
            <Label>Value</Label>
            <Input
              placeholder="API key"
              spellCheck={false}
              onChange={(e) => {
                setEnvVarValue(e.target.value);
              }}
            />
            <p className="text-xs text-secondary-foreground">All keys are encrypted at rest and stored securely.</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              disabled={
                envVarValue === "" || envVarName === "" || envVarType === "" || existingKeyNames.includes(envVarName)
              }
              onClick={() => {
                setEnvVarName("");
                setEnvVarType("");
                setEnvVarValue("");
                onAdd(envVarName, envVarValue);
              }}
              handleEnter
            >
              Add
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
