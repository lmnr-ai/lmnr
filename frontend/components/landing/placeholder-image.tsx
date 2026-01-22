import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const PlaceholderImage = ({ className }: Props) => (
  <div
    className={cn(
      "bg-landing-surface-700 border border-landing-surface-400 rounded-sm overflow-hidden relative",
      className
    )}
  >
    <div className="absolute bg-landing-surface-500 border border-landing-surface-400 h-[352px] left-[-68px] top-[80px] w-[597px]" />
    <div className="absolute bottom-0 left-0 right-0 w-full">
      <div className="bg-gradient-to-l from-landing-surface-700 to-landing-surface-700/0 h-[283px] w-full" />
    </div>
  </div>
);

export default PlaceholderImage;
