import { cn } from "@/lib/utils";

import SecondHalfDesktop from "./second-half-desktop";
import SecondHalfMobile from "./second-half-mobile";

interface Props {
  className?: string;
}

const SecondHalf = ({ className }: Props) => (
  <>
    <SecondHalfDesktop className={cn("hidden md:flex", className)} />
    <SecondHalfMobile className={cn("md:hidden", className)} />
  </>
);

export default SecondHalf;
