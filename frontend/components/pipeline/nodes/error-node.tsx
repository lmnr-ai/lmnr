import { memo } from 'react';

import { ErrorNode } from '@/lib/flow/types';

import GenericNodeComponent from './generic-node';

const ErrorNodeComponent = ({ id, data }: { id: string; data: ErrorNode }) => (
  <>
    <GenericNodeComponent id={id} data={data}></GenericNodeComponent>
  </>
);

export default memo(ErrorNodeComponent);
