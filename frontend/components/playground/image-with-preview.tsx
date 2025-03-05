import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ImageWithPreviewProps {
  src: string;
  alt?: string;
  className?: string;
}
const ImageWithPreview = ({ src, className, alt }: ImageWithPreviewProps) => (
  <Dialog>
    <DialogTrigger>
      <img className={className} alt={alt} src={src} />
    </DialogTrigger>
    <DialogContent>
      <DialogTitle className="flex justify-between items-center">
        <span>Image Preview</span>
        <DialogClose asChild>
          <Button className="size-4" variant="ghost" size="icon">
            <X size={12} />
          </Button>
        </DialogClose>
      </DialogTitle>
      <div className="max-h-[80vh] max-w-[80vw] overflow-auto">
        <img className="object-cover rounded-sm" alt={alt} src={src} />
      </div>
    </DialogContent>
  </Dialog>
);

export default ImageWithPreview;
