import { AiOutlineMinusCircle } from 'react-icons/ai'
import TextareaAutosize from 'react-textarea-autosize'
import { use, useEffect, useRef, useState } from 'react'
import { ChatMessage, ChatMessageContentPart } from '@/lib/types'
import DefaultTextarea from './default-textarea'
import { List, ListPlus, Minus } from 'lucide-react'
import EditableChatMessageContentParts from './editable-chat-message-content-parts'
import { isStringType } from '@/lib/utils'
import { Button } from './button'

interface EditableChatMessageProps {
  defaultMessage: ChatMessage
  index: number
  onDelete: (index: number) => void
  onEdit: (index: number, message: ChatMessage) => void
}

export default function EditableChatMessage({ defaultMessage, index, onDelete, onEdit }: EditableChatMessageProps) {
  const [content, setContent] = useState(defaultMessage.content)
  const [role, setRole] = useState(defaultMessage.role)

  useEffect(() => {
    setContent(content)
  }, [content])

  const changeRole = () => {
    const newMessage: ChatMessage = {
      content,
      role: role === 'user' ? 'assistant' : 'user'
    }

    setRole(newMessage.role)
    onEdit(index, newMessage)
  }

  const textContentChange = (content: string) => {
    const newMessage: ChatMessage = {
      role,
      content
    }
    setContent(newMessage.content)
    onEdit(index, newMessage)
  }

  const partsChange = (parts: ChatMessageContentPart[]) => {
    const newMessage: ChatMessage = {
      role,
      content: parts
    }
    setContent(newMessage.content)
    onEdit(index, newMessage)
  }

  const toggleType = () => {
    let newMessage: ChatMessage;
    if (isStringType(content)) {
      newMessage = {
        role,
        content: [{ type: 'text', text: content }]
      }
    } else {
      newMessage = {
        role,
        content: (content.length > 0 && content[0].type === 'text') ? content[0].text : ''
      }
    }

    setContent(newMessage.content)
    onEdit(index, newMessage)
  }

  return (
    <div className="flex flex-col group border-b p-2">
      <div className="flex mb-2">
        <div className="flex items-center space-x-2">
          <Button variant={"secondary"} className="px-1 h-6 text-xs font-bold" onClick={changeRole}>
            {role.toUpperCase()}
          </Button>
          <Button variant={"outline"} className='px-1 h-6 text-xs text-secondary-foreground' onClick={toggleType}>
            {isStringType(content) ? ("Text") : ("Image")}
          </Button>
        </div>
        <div className="flex-grow"></div>
        <button className="hidden group-hover:block" onClick={() => { onDelete(index) }}>
          <AiOutlineMinusCircle className="text-gray-600" />
        </button>
      </div>
      {
        isStringType(content) ? (
          <DefaultTextarea
            key="text-content"
            placeholder="Message"
            defaultValue={content}
            onChange={e => { textContentChange(e.currentTarget.value) }}
            spellCheck={false}
            maxLength={-1}
          />
        ) : (
          <div className="min-h-16 rounded">
            <EditableChatMessageContentParts parts={content} setParts={(parts) => {
              partsChange(parts)
            }} />
          </div>
        )
      }
    </div >
  )
};
