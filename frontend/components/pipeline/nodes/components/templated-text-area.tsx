import { useCallback, useRef } from 'react';
import { IAceEditorProps } from 'react-ace';
import { v4 } from 'uuid';

import DefaultTextarea from '@/components/ui/default-textarea';
import Ide from '@/components/ui/ide';
import { Label } from '@/components/ui/label';
import { GenericNodeHandle, NodeHandleType } from '@/lib/flow/types';

interface TemplatedTextAreaProps extends IAceEditorProps {
  defaultInputs: Map<string, GenericNodeHandle>;
  onUpdate: (
    value: string,
    inputs: GenericNodeHandle[],
    edgeIdsToRemove: string[]
  ) => void;
  disabled?: boolean;
}

export default function TemplatedTextArea({
  defaultInputs,
  onUpdate,
  disabled,
  ...props
}: TemplatedTextAreaProps) {
  const prevInputVars = useRef(
    new Map<string, GenericNodeHandle>(defaultInputs)
  );

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

    onUpdate(value, inputs, edgeIdsToRemove);
    prevInputVars.current = new Map(
      inputs.map((input) => [input.name!, input])
    );
  }, []);

  return (
    <>
      <Label className="text-gray-500">
        {'enclose {{input_variable}} in double curly braces'}
      </Label>
      {disabled ? (
        <DefaultTextarea
          readOnly={disabled}
          disabled={disabled}
          value={props.value}
          className="cursor-not-allowed bg-secondary-background text-secondary-foreground"
        />
      ) : (
        <Ide
          {...props}
          minLines={3}
          maxLines={Infinity}
          mode="handlebars"
          onChange={(val) => {
            handleChange(val);
          }}
        />
      )}
    </>
  );
}
