import { memo } from 'react'
import GenericNodeComponent from './generic-node'
import { type OutputNode } from '@/lib/flow/types'

const OutputNodeComponent = ({ id, data }: { id: string, data: OutputNode }) => {
  return (
    <GenericNodeComponent id={id} data={data}>
    </GenericNodeComponent>
  )
}

export default memo(OutputNodeComponent)
