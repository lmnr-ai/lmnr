import { AiOutlineMinusCircle } from 'react-icons/ai'
import { Button } from './button'
import DefaultTextarea from './default-textarea'

interface EditableStringListProps {
  messages: string[]
  setMessages: (messages: string[]) => void
}

export default function EditableStringList({ messages, setMessages }: EditableStringListProps) {
  const deleteMessage = (index: number) => {
    const newMessages = [...messages]
    newMessages.splice(index, 1)
    setMessages(newMessages)
  }

  // TODO: Each string must be uniquely identifiable (simply keying by index is not enough since string in the middle can be deleted)
  return (
    <div className="flex flex-col h-full">
      {messages && messages.map((message, index) => (
        <div className="flex flex-col pb-2 group" key={index}>
          <div className="flex">
            <DefaultTextarea
              placeholder={'String'}
              spellCheck={false}
              defaultValue={message}
              className="w-full"
              onChange={(e) => {
                const newMessages = [...messages]
                newMessages[index] = e.currentTarget.value
                setMessages(newMessages)
              }}
            />
            <div className="ml-2 pt-2">
              <button className="hidden group-hover:block" onClick={() => { deleteMessage(index) }}>
                <AiOutlineMinusCircle className="text-gray-600" />
              </button>
            </div>
          </div>
        </div >
      ))}
      <Button className="h-6 w-32 mt-0" onClick={() => { setMessages([...messages, '']) }} variant={'secondary'}>Add string</Button>
    </div >
  )
}
