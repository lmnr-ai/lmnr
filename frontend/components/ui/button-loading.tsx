import { ReloadIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

export function ButtonLoading({ loadingText = "", ...props }) {
  return (
    <Button disabled {...props}>
      <ReloadIcon className="mr-1 animate-spin" />
      {loadingText}
    </Button>
  );
}
