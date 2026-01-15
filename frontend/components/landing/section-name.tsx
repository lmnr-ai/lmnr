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
        "border-t border-landing-text-600 flex font-chivo-mono gap-[30px] items-center leading-normal px-0 py-1 text-sm text-landing-text-600 tracking-[1.68px] whitespace-nowrap w-[216px] relative",
        className
      )}
    >
      <p className="absolute left-[-44px] top-[3px]">{formattedIndex}.</p>
      <p className="relative shrink-0">{label}</p>
    </div>
  );
};

export default SectionName;

