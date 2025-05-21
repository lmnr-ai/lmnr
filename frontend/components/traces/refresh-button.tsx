import { motion } from "framer-motion";
import { RefreshCcw } from "lucide-react";
import { MouseEventHandler, useState } from "react";

import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      <motion.div transition={{ duration: 0.5, ease: "linear" }} className="block" animate={{ rotate }}>
        <RefreshCcw className={cn(iconClassName)} />
      </motion.div>
      <span className="ml-2">Refresh</span>
    </Button>
  );
};

export default RefreshButton;
