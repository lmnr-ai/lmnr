"use client";

import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { AlignLeft, Ellipsis } from "lucide-react";
import { type RefObject } from "react";

import { formatView } from "@/components/sql/format-sql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SqlEditorMenuProps {
  query: string;
  editorRef: RefObject<ReactCodeMirrorRef | null>;
}

export default function SqlEditorMenu({ query, editorRef }: SqlEditorMenuProps) {
  const format = () => {
    const view = editorRef.current?.view;
    if (view) formatView(view);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="More options" variant="ghost" size="icon-sm" className="text-muted-foreground">
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!query.trim()} onClick={format}>
          <AlignLeft className="size-3.5" />
          Format SQL
          <DropdownMenuShortcut>⇧⌥F</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
