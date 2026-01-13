import { type GenerateProjectApiKeyResponse } from "@/lib/api-keys/types";

import { Button } from "../../ui/button";
import { CopyButton } from "../../ui/copy-button";
import { DialogFooter } from "../../ui/dialog";
import { Input } from "../../ui/input";

interface DisplayKeyDialogContentProps {
  apiKey: GenerateProjectApiKeyResponse;
  onClose?: () => void;
}

export function DisplayKeyDialogContent({ apiKey, onClose }: DisplayKeyDialogContentProps) {
  return (
    <>
      <div className="flex flex-col space-y-2">
        <p className="text-secondary-foreground text-sm">
          {" "}
          For security reasons, you will not be able to see this key again. Make sure to copy and save it somewhere
          safe.{" "}
        </p>
        <div className="flex gap-x-2">
          <Input className="flex text-sm" value={apiKey.value} readOnly />
          <CopyButton size="icon" className="min-w-8 h-8" text={apiKey.value} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onClose} handleEnter variant="secondary">
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
