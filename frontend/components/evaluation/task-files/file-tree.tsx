import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

import FileTreeNode from "./file-tree-node";
import { expandTo, type FileNode } from "./utils";

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
  /** Directories that start collapsed; every other one starts expanded (tasks and trial dirs are small). */
  initiallyCollapsed?: string[];
  className?: string;
}

/** A directory holding the selected file is always expanded, also when the selection moves into it. */
export default function FileTree({ nodes, selectedPath, onSelect, initiallyCollapsed, className }: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
    expandTo(new Set(initiallyCollapsed), selectedPath)
  );
  const [shownPath, setShownPath] = useState(selectedPath);
  if (selectedPath !== shownPath) {
    setShownPath(selectedPath);
    setCollapsed(expandTo(collapsed, selectedPath));
  }

  const onToggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  return (
    <ul className={cn("flex flex-col gap-0.5 p-1", className)}>
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          collapsed={collapsed}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
