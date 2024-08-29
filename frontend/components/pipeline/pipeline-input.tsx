import { NodeHandleType } from '@/lib/flow/types';
import DefaultTextarea from '../ui/default-textarea';
import EditableChat from '../ui/editable-chat';
import { ChatMessage } from '@/lib/types';
import { Label } from '../ui/label';
import { InputVariable } from '@/lib/pipeline/types';
import EditableStringList from '../ui/editable-string-list';

interface PipelineTraceProps {
  onInputsChange: (inputs: InputVariable[]) => void
  inputs: InputVariable[],
}


export default function PipelineInput({ onInputsChange, inputs }: PipelineTraceProps) {

  return (
    <div className='flex flex-col border-b p-4'>
      {inputs?.length > 0 && (
        <>
          {inputs.map((input, i) => (
            <div key={`pipeline-input-mapped-${input.executionId}-${input.id}`} className='mb-2 flex flex-col space-y-2'>
              <Label className=''>{input.name}</Label>

              {input.type == NodeHandleType.STRING && (
                <DefaultTextarea
                  placeholder={'example ' + input.name}
                  spellCheck={true}
                  value={input.value as string}
                  className="w-full"
                  onChange={(e) => {
                    const newInputs = [...inputs]
                    newInputs[i].value = e.currentTarget.value
                    onInputsChange(newInputs)
                  }}
                />
              )}
              {input.type == NodeHandleType.STRING_LIST && (
                <div className="min-h-16 rounded p-2 border">
                  <EditableStringList
                    messages={input.value as string[]}
                    setMessages={(messages) => {
                      const newInputs = [...inputs]
                      newInputs[i].value = messages
                      onInputsChange(newInputs)
                    }}
                  />
                </div>
              )}
              {input.type == NodeHandleType.CHAT_MESSAGE_LIST && (
                <div className="min-h-16 rounded border">
                  <EditableChat
                    messages={input.value as ChatMessage[]}
                    setMessages={(messages) => {
                      const newInputs = [...inputs]
                      newInputs[i].value = messages
                      onInputsChange(newInputs)
                    }}
                  />
                </div>
              )}
              {
                input.type == NodeHandleType.ANY && (
                  <DefaultTextarea
                    placeholder={'example ' + input.name}
                    spellCheck={true}
                    value={input.value as string}
                    className="w-full"
                    onChange={(e) => {
                      const newInputs = [...inputs]
                      newInputs[i].value = e.currentTarget.value
                      onInputsChange(newInputs)
                    }}
                  />
                )
              }
            </div>
          ))}
        </>
      )}
    </div>
  );
}
