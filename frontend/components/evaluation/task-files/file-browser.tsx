import { type ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import FileTree from "./file-tree";
import FileViewer from "./file-viewer";
import { type FileNode } from "./utils";

interface FileBrowserProps {
  /** Prefix for the resizable panels' ids. */
  id: string;
  /** Shown above the tree: the task. */
  title: string;
  /** Where the files come from, on hover. */
  hint: string;
  /** Shown at the end of the title row, e.g. a link to where the files come from. */
  titleAction?: ReactNode;
  nodes: FileNode[];
  open: FileNode;
  onSelect: (node: FileNode) => void;
  /** Where the file at `path` (relative to the tree's root) is downloaded from. */
  contentUrl: (path: string) => string;
  /** Shown under the tree, e.g. a folder that isn't available yet. */
  note?: string;
  /** Top-level folders that start collapsed. */
  initiallyCollapsed?: string[];
}

/** A folder from an archive (a run's upload, a task version): file tree on the left, the open file on the right. */
export default function FileBrowser({
  id,
  title,
  hint,
  titleAction,
  nodes,
  open,
  onSelect,
  contentUrl,
  note,
  initiallyCollapsed,
}: FileBrowserProps) {
  return (
    <ResizablePanelGroup id={id} orientation="horizontal">
      <ResizablePanel id={`${id}-tree`} defaultSize={30} minSize={15} className="min-w-0">
        <div className="h-full overflow-auto">
          <div className="flex items-center gap-2 border-b px-3 py-1.5 font-mono text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate" title={hint}>
              {title}
            </span>
            {titleAction}
          </div>
          <FileTree
            nodes={nodes}
            selectedPath={open.path}
            onSelect={onSelect}
            initiallyCollapsed={initiallyCollapsed}
          />
          {note && <p className="px-3 py-2 text-xs text-muted-foreground">{note}</p>}
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id={`${id}-viewer`} defaultSize={70} minSize={30} className="min-w-0">
        <FileViewer key={open.path} url={contentUrl(open.path)} path={open.path} size={open.size} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
