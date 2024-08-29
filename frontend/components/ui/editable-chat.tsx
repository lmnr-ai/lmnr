import EditableChatMessage from './editable-chat-message'
import { Button } from './button'
import { ChatMessage } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'

interface EditableChatProps {
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void
}

/**
 * Container for EditableChatMessage list.
 * 
 * The main purpose of this component is to (1) map messages to EditableChatMessage components,
 * and (2) manage the keys for each EditableChatMessage component to be uniquely identified by DOM.
 * 
 * Main point: when "setMessages" is called, the component will re-render with the new messages.
 * However, essentially, idsRef will help each EditableChatMessage to be "remembered" by DOM with persistent id
 * and not be re-rendered.
 * Also, these unique ids are only generated once on the frontend only and they help to mainly solve the problem
 * with deleting message from the middle of the list. Without these ids, if you delete in the middle, the ids will
 * be rendered wrongly.
 */
export default function EditableChat({ messages, setMessages }: EditableChatProps) {
  const idsRef = useRef<number[] | null>(null);
  const [_, forceUpdate] = useState(0);

  useEffect(() => {
    idsRef.current = messages.map((_, index) => index);
  }, [])

  useEffect(() => {
    // Force re-render, otherwise when switching the mode, it doesn't render anything thinking that the idsRef.current is null.
    forceUpdate(n => n + 1);
  }, [idsRef.current])

  const addMessage = () => {
    const newMessage: ChatMessage = {
      role: 'user',
      content: ''
    }

    const newId = idsRef.current!.length > 0 ? idsRef.current![idsRef.current!.length - 1] + 1 : 0;
    idsRef.current!.push(newId);
    setMessages([...messages, newMessage])
  }

  const deleteMessage = (index: number) => {
    idsRef.current!.splice(index, 1);
    const newMessages = [...messages]
    newMessages.splice(index, 1)
    setMessages(newMessages)
  }

  const editMessage = (index: number, message: ChatMessage) => {
    const newMessages = [...messages]
    newMessages[index] = message
    setMessages(newMessages)
  }

  return (
    (idsRef.current !== null) && (
      <div className="flex flex-col h-full">
        {messages && messages.map((message, index) => (
          <EditableChatMessage
            key={idsRef.current![index]}
            index={index}
            defaultMessage={message}
            onDelete={deleteMessage}
            onEdit={editMessage}
          />
        ))}
        <div className='p-2'>
          <Button className="h-6" onClick={addMessage} variant={'secondary'}>Add message</Button>
        </div>
      </div >
    )
  )
}
