// TODO: delete once the landing redesign is complete. Imports also pinned to
// `_old` files so this snapshot stays compilable while the new layout takes
// shape.

"use client";

import { cn } from "@/lib/utils";

import Blurb from "./blurb";
import Footer from "./footer";
import Hero from "./hero/index_old";
import SecondHalf from "./second-half";
import ThreeCategories from "./three-categories";

interface Props {
  className?: string;
  hasSession: boolean;
}

const Landing = ({ className, hasSession }: Props) => (
  <div className={cn("overflow-x-clip", className)}>
    <Hero hasSession={hasSession} />
    <ThreeCategories />
    <Blurb />
    <SecondHalf />
    <Footer />
  </div>
);

export default Landing;
