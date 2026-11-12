import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import FileTree from "./file-tree";
import FileViewer from "./file-viewer";
import { type FileNode } from "./utils";

interface FileBrowserProps {
  /** Prefix for the resizable panels' ids. */
  id: string;
  /** Shown above the tree: the folder's name. */
  title: string;
  nodes: FileNode[];
  open: FileNode;
  onSelect: (node: FileNode) => void;
  /** Where the file at `path` (relative to the tree's root) is downloaded from. */
  contentUrl: (path: string) => string;
}

/** A folder from a remote run's archive: file tree on the left, the open file on the right. */
export default function FileBrowser({ id, title, nodes, open, onSelect, contentUrl }: FileBrowserProps) {
  return (
    <ResizablePanelGroup id={id} orientation="horizontal">
      <ResizablePanel id={`${id}-tree`} defaultSize={30} minSize={15} className="min-w-0">
        <div className="h-full overflow-auto">
          <div className="truncate border-b px-3 py-1.5 font-mono text-xs text-muted-foreground" title={title}>
            {title}
          </div>
          <FileTree nodes={nodes} selectedPath={open.path} onSelect={onSelect} />
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id={`${id}-viewer`} defaultSize={70} minSize={30} className="min-w-0">
        <FileViewer key={open.path} url={contentUrl(open.path)} path={open.path} size={open.size} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
