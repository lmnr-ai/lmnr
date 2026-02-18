import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  lines: string[];
}

const SectionTitle = ({ lines, className }: Props) => (
  <div className={cn("flex flex-col md:gap-1 gap-0.5 items-start w-full", className)}>
    <div className="flex items-center py-1 w-full">
      <div className="md:text-base text-xs text-landing-text-100 font-sans whitespace-nowrap">
        {lines.map((line, i) => (
          <p key={i} className={i < lines.length - 1 ? "mb-0" : ""}>
            {line}
          </p>
        ))}
      </div>
    </div>
    <div className="bg-landing-surface-400 h-[2px] w-[180px] md:w-[140px]" />
  </div>
);

export default SectionTitle;
