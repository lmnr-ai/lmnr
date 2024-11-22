import { ErrorNode } from '@/lib/flow/types';
import GenericNodeComponent from './generic-node';
import { memo } from 'react';

const ErrorNodeComponent = ({ id, data }: { id: string; data: ErrorNode }) => (
  <>
    <GenericNodeComponent id={id} data={data}></GenericNodeComponent>
  </>
);

export default memo(ErrorNodeComponent);
