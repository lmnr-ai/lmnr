import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const SecondHalf = ({ className }: Props) => {
  return (
    <div className={cn("flex", className)}>
      SecondHalf
    </div>
  );
};

export default SecondHalf;

