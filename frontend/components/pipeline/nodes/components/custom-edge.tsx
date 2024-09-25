import { useFlowContext } from '@/contexts/pipeline-version-context';
import useStore from '@/lib/flow/store';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  MarkerType,
  getBezierPath,
  useReactFlow,
} from 'reactflow';

const onEdgeClick = (evt: any, id: any) => {
  evt.stopPropagation();
};

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data
}: EdgeProps) {
  const { setEdges } = useStore();
  const { editable } = useFlowContext();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25
  });

  const onEdgeClick = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{
        ...style,
        strokeWidth: 2,
        stroke: data?.isHover && editable ? '#60a5fa' : style.stroke,
      }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            // everything inside EdgeLabelRenderer has no pointer events by default
            // if you have an interactive element, set pointer-events: all
            pointerEvents: 'all',
          }}
          className={cn("nodrag border nopan bg-primary rounded-full w-6 h-6", data?.isHover && editable ? 'flex items-center justify-center' : 'hidden')}
          onClick={onEdgeClick}
        >
          {/* <button className="" > */}
          <X size={12} strokeWidth={3} />
          {/* </button> */}
        </div>
      </EdgeLabelRenderer >
    </>
  );
}
