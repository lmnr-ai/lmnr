import { cn } from "@/lib/utils";

const ROW_HEIGHT = 36;
const TREE_GUTTER_WIDTH = 16;
const TREE_LINE_LEFT_BASE = 9;
const TREE_LINE_WIDTH = TREE_GUTTER_WIDTH - TREE_LINE_LEFT_BASE;

interface BranchConnectorProps {
  depth: number;
  branchMask: boolean[];
  isSelected?: boolean;
}

export function BranchConnector({ depth, branchMask, isSelected = false }: BranchConnectorProps) {
  return (
    <>
      {Array.from({ length: depth }).map((_, d) => {
        const isLastColumn = d === depth - 1;

        return (
          <div key={d} className={cn("shrink-0 relative")} style={{ width: TREE_GUTTER_WIDTH }}>
            {/* L-connector for the last column */}
            {isLastColumn && (
              <div
                className={cn("absolute border-l-2 border-b-2 rounded-bl-md group-hover:border-[hsl(240_6%_26%)]", {
                  "border-[hsl(240_6%_34%)] group-hover:border-[hsl(240_6%_40%)] ": isSelected,
                })}
                style={{
                  height: ROW_HEIGHT / 2,
                  left: TREE_LINE_LEFT_BASE,
                  width: TREE_LINE_WIDTH,
                }}
              />
            )}

            {/* Vertical continuation line if more siblings at this depth */}
            {branchMask[d] && (
              <div
                className={cn("absolute h-full border-l-2 group-hover:border-[hsl(240_6%_26%)]", {
                  "border-[hsl(240_6%_34%)] group-hover:border-[hsl(240_6%_40%)] ": isSelected,
                })}
                style={{ left: TREE_LINE_LEFT_BASE }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
