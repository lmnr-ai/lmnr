import { ChatMessageContentPart, ChatMessageText } from '@/lib/types'
import { useEffect, useRef } from 'react'
import EditableChatMessageContentPart from './editable-chat-message-content-part'
import { AiOutlinePlusCircle } from 'react-icons/ai'

interface EditableChatMessageContentPartsProps {
  parts: ChatMessageContentPart[]
  setParts: (parts: ChatMessageContentPart[]) => void
}

export default function EditableChatMessageContentParts({ parts, setParts }: EditableChatMessageContentPartsProps) {
  // TODO: Find something better than using 0 here.
  // When we switch from string content to ContentParts, we only need the first one.
  // When we open the pre-loaded page with default parts, this error doesn't happen.
  const idsRef = useRef<number[]>([0]);

  useEffect(() => {
    idsRef.current = parts.map((_, index) => index);
  }, [])

  const addPart = () => {
    const newPart: ChatMessageText = {
      type: 'text',
      text: ''
    }

    const newId = idsRef.current!.length > 0 ? idsRef.current![idsRef.current!.length - 1] + 1 : 0;
    idsRef.current!.push(newId);
    setParts([...parts, newPart])
  }

  const deletePart = (index: number) => {
    idsRef.current!.splice(index, 1);
    const newParts = [...parts]
    newParts.splice(index, 1)
    setParts(newParts)
  }

  const editPart = (index: number, part: ChatMessageContentPart) => {
    const newParts = [...parts]
    newParts[index] = part
    setParts(newParts)
  }

  return (
    <div className="">
      {idsRef.current.map((_, index) => (
        <EditableChatMessageContentPart
          key={idsRef.current![index]}
          index={index}
          defaultPart={parts[index]}
          onDelete={deletePart}
          onEdit={editPart}
        />
      ))}
      <button onClick={addPart} className="mt-0 ml-2">
        <AiOutlinePlusCircle size={16} className="text-gray-600 hover:bg-secondary rounded" />
      </button>
    </div >
  )
}
