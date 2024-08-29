import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Input } from "../ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EnvVars } from "@/lib/env/utils";

interface AddEnvVarDialogProps {
  onAdd: (name: string, value: string) => void
}

export default function AddEnvVarDialog({ onAdd }: AddEnvVarDialogProps) {

  const [envVarType, setEnvVarType] = useState<string>('')
  const [envVarName, setEnvVarName] = useState<string>('')
  const [envVarValue, setEnvVarValue] = useState<string>('')

  return (

    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8">
          <Plus className='w-4 mr-1 text-gray-500' />
          Add variable
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add/edit env variable</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label>Name</Label>
          <Select
            onValueChange={value => {
              setEnvVarType(value)
              if (value !== 'custom') {
                setEnvVarName(value)
              } else {
                setEnvVarName('')
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose env var..." />
            </SelectTrigger>
            <SelectContent>
              {
                Object.values(EnvVars).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))
              }
              <SelectItem key={-1} value={'custom'}>
                Custom
              </SelectItem>
            </SelectContent>
          </Select>
          {envVarType === 'custom' &&
            <Input
              placeholder="Name"
              onChange={(e) => {
                setEnvVarName(e.target.value)
              }}
            />
          }
          <Label>Value</Label>
          <Input
            placeholder="Value"
            spellCheck={false}
            onChange={(e) => {
              setEnvVarValue(e.target.value)
            }}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              disabled={envVarValue === '' || envVarName === '' || envVarType === ''}
              onClick={() => {
                setEnvVarName('')
                setEnvVarType('')
                setEnvVarValue('')
                onAdd(envVarName, envVarValue)
              }}
              handleEnter
            >
              Add
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  )
}