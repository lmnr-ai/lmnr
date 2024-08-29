import { Label } from "@/components/ui/label";
import { GenericNodeHandle, NodeHandleType } from "@/lib/flow/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 } from "uuid";
import { encodingForModel } from "js-tiktoken";
import Ide from "@/components/ui/ide";
import { IAceEditorProps } from "react-ace";

interface TemplatedTextAreaProps extends IAceEditorProps {
  defaultInputs: Map<string, GenericNodeHandle>
  onUpdate: (value: string, inputs: GenericNodeHandle[], edgeIdsToRemove: string[]) => void
}

export default function TemplatedTextArea({
  defaultInputs,
  onUpdate,
  ...props }: TemplatedTextAreaProps) {

  const prevInputVars = useRef(new Map<string, GenericNodeHandle>(defaultInputs));

  // regex to match {{input_variable}}
  const regex = /{{(?:json\s+)?([A-Za-z0-9_\-\$]+)}}/g;

  const handleChange = useCallback((value: string) => {
    const matches = value.match(regex) ?? [];
    const currentInputVars = new Set(
      matches.map((match) => match.substring(2, match.length - 2))
    );

    let inputs: GenericNodeHandle[] = [];

    let edgeIdsToRemove: string[] = [];

    // remove deleted input variables
    for (const [name, input] of prevInputVars.current.entries()) {
      if (!currentInputVars.has(name)) {
        // drop edge if exists for this handle
        edgeIdsToRemove.push(input.id);
      } else {
        inputs.push(input);
      }
    }

    // add new input variables
    for (const name of currentInputVars) {
      if (!prevInputVars.current.has(name)) {
        const id = v4();
        inputs.push({
          id,
          name,
          type: NodeHandleType.STRING
        });
      }
    }

    onUpdate(value, inputs, edgeIdsToRemove)
    prevInputVars.current = new Map(inputs.map((input) => [input.name!, input]))
  }, [])

  return (
    <>
      <Label className='text-gray-500'>{"enclose {{input_variable}} in double curly braces"}</Label>
      <Ide
        {...props}
        minLines={3}
        maxLines={Infinity}
        mode="handlebars"
        onChange={(val) => {
          handleChange(val);
        }}
      />
    </>
  );
}