import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { type MouseEventHandler, useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const RefreshButton = ({ iconClassName, onClick, ...rest }: ButtonProps & { iconClassName?: string }) => {
  const [rotate, setRotate] = useState(0);

  const handleOnClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    setRotate((prev) => prev + 180);
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Button onClick={handleOnClick} {...rest}>
      <motion.div
        transition={{ duration: 0.5, ease: "linear" }}
        className="block text-secondary-foreground"
        animate={{ rotate }}
      >
        <RefreshCw className={cn("size-3.5", iconClassName)} />
      </motion.div>
      <span className="ml-1 text-secondary-foreground text-xs">Refresh</span>
    </Button>
  );
};

export default RefreshButton;
