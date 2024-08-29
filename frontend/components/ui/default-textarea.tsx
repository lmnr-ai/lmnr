import React from 'react'
import TextareaAutosize, { type TextareaAutosizeProps } from 'react-textarea-autosize'
import { cn } from '@/lib/utils'

const DefaultTextarea = ({ className, ...props }: TextareaAutosizeProps) => {
  return <TextareaAutosize
    className={cn('text-sm min-h-[8px] bg-background p-2 m-0 border rounded-md focus:outline-none resize-none', className)}
    {...props}
  />
}

export default DefaultTextarea
