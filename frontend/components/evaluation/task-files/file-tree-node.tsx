import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";

import { type FileNode } from "./utils";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (node: FileNode) => void;
}

export default function FileTreeNode({ node, depth, selectedPath, collapsed, onToggle, onSelect }: FileTreeNodeProps) {
  const isDir = !!node.children;
  const isOpen = isDir && !collapsed.has(node.path);
  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : FileText;

  return (
    <li>
      <button
        type="button"
        title={node.path}
        onClick={() => (isDir ? onToggle(node.path) : onSelect(node))}
        className={cn(
          // Hover and selected states match the main sidebar menu (`SidebarMenuButton`).
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs hover:overlay-hover hover:text-foreground-50 active:overlay-selected active:text-foreground-50",
          node.path === selectedPath && "overlay-selected font-medium text-foreground-50"
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <ChevronRight
          className={cn("size-3 shrink-0 text-muted-foreground", !isDir && "invisible", isOpen && "rotate-90")}
        />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && (
        <ul>
          {node.children!.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
