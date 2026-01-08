import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const SystemDiagram = ({ className }: Props) => {
  return <div className={cn("flex bg-landing-surface-700 w-[636px] h-[674px]", className)}>SystemDiagram</div>;
};

export default SystemDiagram;
