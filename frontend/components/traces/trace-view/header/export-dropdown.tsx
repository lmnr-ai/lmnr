import { Check, Globe, Link, Loader, Lock, Upload } from "lucide-react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportDropdownProps {
  isVisibilityLoading: boolean;
  handleChangeVisibility: (value: "private" | "public") => void;
  isPublic: boolean;
  handleCopyLink: () => void;
  copiedLink: boolean;
}

const ExportDropdown = ({
  isVisibilityLoading,
  handleChangeVisibility,
  isPublic,
  handleCopyLink,
  copiedLink,
}: ExportDropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="hover:bg-secondary px-1.5">
          <Upload className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          disabled={isVisibilityLoading}
          onSelect={(e) => {
            e.preventDefault();
            handleChangeVisibility(isPublic ? "private" : "public");
          }}
        >
          {isVisibilityLoading ? (
            <Loader className="size-3.5 animate-spin" />
          ) : isPublic ? (
            <Lock className="size-3.5" />
          ) : (
            <Globe className="size-3.5" />
          )}
          {isPublic ? "Make private" : "Make public"}
        </DropdownMenuItem>
        {isPublic && (
          <DropdownMenuItem onClick={handleCopyLink}>
            {copiedLink ? <Check className="size-3.5" /> : <Link className="size-3.5" />}
            {copiedLink ? "Copied!" : "Copy link"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default memo(ExportDropdown);
