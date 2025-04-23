import { X } from "lucide-react";
import { ImgHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ImageWithPreview = ({ className, ...rest }: ImgHTMLAttributes<HTMLImageElement>) => (
  <Dialog>
    <DialogTrigger>
      <img className={cn("cursor-pointer hover:opacity-90", className)} {...rest} />
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
      <img className="w-auto h-auto rounded-sm max-w-[80vw] max-h-[80vh]" src={rest.src} alt={rest.alt} />
    </DialogContent>
  </Dialog>
);

export default ImageWithPreview;
