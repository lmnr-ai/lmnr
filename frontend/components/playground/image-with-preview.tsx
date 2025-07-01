import { X } from "lucide-react";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ImageWithPreviewProps {
  src: string;
  alt: string;
  className?: string;
}
const ImageWithPreview = ({ src, className, alt }: ImageWithPreviewProps) => {
  const [isLoading, setIsLoading] = useState(true);
  return (
    <Dialog>
      <DialogTrigger>
        <img
          onError={() => setIsLoading(false)}
          onLoad={() => setIsLoading(false)}
          className={cn(
            "cursor-pointer hover:opacity-90",
            {
              "bg-secondary animate-pulse": isLoading,
            },
            className
          )}
          alt={alt}
          src={src}
        />
      </DialogTrigger>
      <DialogContent className="max-w-none w-fit overflow-hidden">
        <DialogTitle className="flex justify-between items-center">
          <span>Image Preview</span>
          <DialogClose asChild>
            <Button className="size-4" variant="ghost" size="icon">
              <X size={12} />
            </Button>
          </DialogClose>
        </DialogTitle>
        <img className="w-full h-full rounded-sm max-w-[80vw] max-h-[80vh]" alt={alt} src={src} />
      </DialogContent>
    </Dialog>
  );
};

export default memo(ImageWithPreview);
