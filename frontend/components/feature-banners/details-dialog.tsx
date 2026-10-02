"use client";

import { Streamdown } from "streamdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { withBasePath } from "@/lib/utils";

import { type FeatureBannerDials } from "./dials";
import { useFeatureBannerStore } from "./store";

interface FeatureBannerDetailsDialogProps {
  dials: FeatureBannerDials;
}

const FeatureBannerDetailsDialog = ({ dials }: FeatureBannerDetailsDialogProps) => {
  const shown = useFeatureBannerStore((s) => s.banners.find((b) => b.id === s.detailsBannerId));
  const open = useFeatureBannerStore((s) => s.detailsOpen);
  const closeDetails = useFeatureBannerStore((s) => s.closeDetails);
  const acknowledge = useFeatureBannerStore((s) => s.acknowledge);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && closeDetails()}>
      <DialogContent className="p-0 gap-0 overflow-hidden" style={{ maxWidth: dials.modal.maxWidth }}>
        {shown && (
          <>
            <img
              src={withBasePath(shown.image_src)}
              alt=""
              className="w-full object-cover object-top border-b"
              style={{ maxHeight: dials.modal.imageMaxHeight }}
            />
            <div className="flex flex-col gap-3 p-6 max-h-[50vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg">{shown.title}</DialogTitle>
                {dials.card.showOpenSourceBadge && shown.open_source && <Badge variant="outline">Open source</Badge>}
              </div>
              <DialogDescription>{shown.description}</DialogDescription>
              {shown.long_description && (
                <Streamdown className="text-sm text-secondary-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {shown.long_description}
                </Streamdown>
              )}
            </div>
            <DialogFooter className="px-6 pb-6">
              <Button
                onClick={() => {
                  acknowledge(shown.id);
                  closeDetails();
                }}
              >
                {dials.card.acknowledgeLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FeatureBannerDetailsDialog;
