import { memo } from 'react'
import GenericNodeComponent from './generic-node'
import { ErrorNode } from '@/lib/flow/types'

const ErrorNodeComponent = ({ id, data }: { id: string, data: ErrorNode }) => {
  return (
    <>
      <GenericNodeComponent id={id} data={data}>
      </GenericNodeComponent>
    </>
  )
}

export default memo(ErrorNodeComponent)
