import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  type ReactFlowState,
  useInternalNode,
  useStore,
} from "@xyflow/react";
import React, { memo, useMemo } from "react";

import { getEdgeParams } from "@/lib/lang-graph/utils";

export interface EdgeConfig {
  baseOffset: number;
  strokeWidth: number;
  labelStyle?: React.CSSProperties;
  labelClassName?: string;
  curveIntensity?: number;
}

export interface GetSpecialPathParams {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

const DEFAULT_CONFIG: EdgeConfig = {
  baseOffset: 50,
  strokeWidth: 2,
  labelClassName: "px-2 py-1 bg-white border border-gray-300 rounded shadow-sm text-xs font-medium",
  curveIntensity: 0.25,
};

export const getSpecialPath = (
  { sourceX, sourceY, targetX, targetY }: GetSpecialPathParams,
  offset: number
): string => {
  const centerX = (sourceX + targetX) / 2;
  const centerY = (sourceY + targetY) / 2;

  return `M ${sourceX} ${sourceY} Q ${centerX} ${centerY + offset} ${targetX} ${targetY}`;
};

const getBidirectionalOffset = (source: string, target: string, baseOffset: number): number => {
  const shouldCurveUp = source < target;
  return shouldCurveUp ? baseOffset : -baseOffset;
};

const calculateLabelPosition = (sx: number, sy: number, tx: number, ty: number, offset?: number): [number, number] => {
  const labelX = (sx + tx) / 2;
  const labelY = (sy + ty) / 2 + (offset ? offset / 2 : 0);
  return [labelX, labelY];
};

const useBidirectionalEdgeDetection = (source: string, target: string) =>
  useStore((s: ReactFlowState) =>
    s.edges.some((e) => (e.source === target && e.target === source) || (e.target === source && e.source === target))
  );

const useEdgePath = (
  sourceNode: any,
  targetNode: any,
  source: string,
  target: string,
  isBidirectional: boolean,
  config: EdgeConfig
) =>
  useMemo(() => {
    if (!sourceNode || !targetNode) {
      return { path: "", labelX: 0, labelY: 0 };
    }

    const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

    if (isBidirectional) {
      const offset = getBidirectionalOffset(source, target, config.baseOffset);
      const path = getSpecialPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty }, offset);
      const [labelX, labelY] = calculateLabelPosition(sx, sy, tx, ty, offset);

      return { path, labelX, labelY };
    } else {
      const edgePathParams = {
        sourceX: sx,
        sourceY: sy,
        sourcePosition: sourcePos,
        targetX: tx,
        targetY: ty,
        targetPosition: targetPos,
        curvature: config.curveIntensity,
      };

      const [path, labelX, labelY] = getBezierPath(edgePathParams);
      return { path, labelX, labelY };
    }
  }, [sourceNode, targetNode, source, target, isBidirectional, config]);

interface ConditionalEdgeProps extends EdgeProps {
  config?: Partial<EdgeConfig>;
}

const ConditionalEdge = ({
  id,
  source,
  target,
  style = {},
  markerEnd,
  label,
  config: userConfig = {},
}: ConditionalEdgeProps) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const isBiDirectionEdge = useBidirectionalEdgeDetection(source, target);

  const config = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...userConfig,
    }),
    [userConfig]
  );

  const { path, labelX, labelY } = useEdgePath(sourceNode, targetNode, source, target, isBiDirectionEdge, config);

  const edgeStyle = useMemo(
    () => ({
      strokeWidth: config.strokeWidth,
      ...style,
    }),
    [config.strokeWidth, style]
  );

  const labelTransform = useMemo(() => `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, [labelX, labelY]);

  const labelStyle = useMemo(
    () => ({
      position: "absolute" as const,
      transform: labelTransform,
      fontSize: 11,
      pointerEvents: "all" as const,
      ...config.labelStyle,
    }),
    [labelTransform, config.labelStyle]
  );

  if (!sourceNode || !targetNode || !path) {
    return null;
  }

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={edgeStyle} />
      {label && (
        <EdgeLabelRenderer>
          <div style={labelStyle} className={config.labelClassName}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(ConditionalEdge);
