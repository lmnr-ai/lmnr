import { useCallback, useState } from "react";

import FileTreeNode from "./file-tree-node";
import { type FileNode } from "./utils";

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
}

/** A task's files; every directory starts expanded (tasks are small). */
export default function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const onToggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  return (
    <ul className="flex flex-col p-1">
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
