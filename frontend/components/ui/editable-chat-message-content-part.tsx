import { AiOutlineMinusCircle } from 'react-icons/ai'
import { useState } from 'react'
import { ChatMessageContentPart, ChatMessageImage, ChatMessageImageUrl, ChatMessageText } from '@/lib/types'
import DefaultTextarea from './default-textarea'
import { Input } from './input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

interface EditableChatMessageContentPartProps {
  defaultPart: ChatMessageContentPart
  index: number
  onDelete: (index: number) => void
  onEdit: (index: number, part: ChatMessageContentPart) => void
}

export default function EditableChatMessageContentPart({ defaultPart, index, onDelete, onEdit }: EditableChatMessageContentPartProps) {
  const [part, setPart] = useState(defaultPart);

  const changeType = () => {
    const newType = (part.type === 'text') ? 'image' : (part.type === 'image' ? 'image_url' : 'text');

    let newPart: ChatMessageContentPart;
    if (newType === 'text') {
      newPart = { type: 'text', text: '' };
    } else if (newType === 'image') {
      newPart = {
        type: 'image', mediaType: SUPPORTED_MEDIA_TYPES[0], data: ''
      }
    } else {
      newPart = { type: 'image_url', url: '', detail: null }
    };

    setPart(newPart);
    onEdit(index, newPart);
  }

  const textChange = (text: string) => {
    const newPart = { ...part, text };
    setPart(newPart);
    onEdit(index, newPart);
  }

  const mediaTypeChange = (mediaType: string) => {
    const newPart = { ...part, mediaType };
    setPart(newPart);
    onEdit(index, newPart);
  }

  const imageDataChange = (data: string) => {
    const newPart = { ...part, data };
    setPart(newPart);
    onEdit(index, newPart);
  }

  const imageUrlChange = (url: string) => {
    const newPart = { ...part, url };
    setPart(newPart);
    onEdit(index, newPart);
  }

  return (
    <div className="flex flex-col pb-2 group">
      <div className="flex items-center mb-2">
        <div className="flex">
          <button className="px-1.5 h-5 text-xs bg-secondary rounded" onClick={changeType}>
            {part.type}
          </button>
        </div>
        <div className="flex-grow"></div>
        <div>
          <button className="hidden group-hover:block" onClick={() => { onDelete(index) }}>
            <AiOutlineMinusCircle className="h-4 text-gray-600" />
          </button>
        </div>
      </div>
      {
        (part.type === 'text') ? (
          <DefaultTextarea
            key="text"
            placeholder="Text content"
            defaultValue={(part as ChatMessageText).text}
            onChange={e => { textChange(e.currentTarget.value) }}
            spellCheck={false}
            maxLength={-1}
          />
        ) : (
          (part.type === 'image') ? (
            <div className="flex flex-col space-y-2">
              <Select
                defaultValue={(part as ChatMessageImage).mediaType}
                onValueChange={mediaTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select media type" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_MEDIA_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Image as base64"
                defaultValue={(part as ChatMessageImage).data}
                onChange={e => { imageDataChange(e.currentTarget.value) }}
                spellCheck={false}
                maxLength={-1}
              />
            </div>
          ) : (
            <DefaultTextarea
              placeholder="Image url"
              defaultValue={(part as ChatMessageImageUrl).url}
              onChange={e => { imageUrlChange(e.currentTarget.value) }}
              spellCheck={false}
              maxLength={-1}
            />
          )
        )
      }
    </div >
  )
};
