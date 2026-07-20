import { Button } from "@/components/ui/button.tsx";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { FileText } from "@/components/ui/icon-lib";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

interface MetadataProps {
  metadata?: string;
}

const Metadata = ({ metadata }: MetadataProps) => {
  if (!metadata) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-6 text-xs px-1.5 hover:bg-secondary">
          <FileText size={14} className="mr-1" />
          <span>Metadata</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 overflow-hidden">
        <ContentRenderer
          value={metadata}
          readOnly={true}
          defaultMode="json"
          className="max-h-[50vh] border-none bg-muted/30"
          placeholder=""
        />
      </PopoverContent>
    </Popover>
  );
};

export default Metadata;
