import { memo } from 'react';
import GenericNodeComponent from './generic-node';
import {
  LLMNode,
} from '@/lib/flow/types';

const LLMNodeComponent = ({
  id,
  data
}: {
  id: string;
  data: LLMNode;
}) => {
  return (
    <GenericNodeComponent id={id} data={data} />
  )
};

export default memo(LLMNodeComponent);
