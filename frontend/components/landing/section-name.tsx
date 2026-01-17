import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  label: string;
  index: number;
}

const SectionName = ({ className, label, index }: Props) => {
  const formattedIndex = String(index).padStart(2, "0");

  return (
    <div
      className={cn(
        "flex font-chivo-mono gap-[30px] items-center leading-normal px-0 py-1 text-sm text-landing-text-600 tracking-[0.02em] whitespace-nowrap w-[216px] relative my-[-60px]",
        className
      )}
    >
      <motion.div
        className="absolute top-0 left-0 h-[1px] bg-landing-text-600"
        initial={{ width: "50%" }}
        whileInView={{ width: "100%" }}
        viewport={{ once: false }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      <p className="absolute left-[-44px] top-[4px]">{formattedIndex}.</p>
      <p className="relative shrink-0">{label}</p>
    </div>
  );
};

export default SectionName;
