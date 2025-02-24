import { Plus } from "lucide-react";
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
        <Button variant="outline" className="h-8">
          <Plus className="w-4 mr-1 text-gray-500" />
          Add API key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add API key</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
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
          {envVarType === "custom" && (
            <Input
              placeholder="Name"
              onChange={(e) => {
                setEnvVarName(e.target.value);
              }}
            />
          )}
          <Label>Value</Label>
          <p className="text-sm text-secondary-foreground">All keys are encrypted at rest and stored securely.</p>
          <Input
            placeholder="API key"
            spellCheck={false}
            onChange={(e) => {
              setEnvVarValue(e.target.value);
            }}
          />
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
