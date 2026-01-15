"use client";

import { cn } from "@/lib/utils";
import Hero from "./hero";
import ThreeCategories from "./three-categories";
import Blurb from "./blurb";
import SecondHalf from "./second-half";
import Footer from "./footer";
import LenisProvider from "./lenis-provider";

interface Props {
  className?: string;
}

const Landing = ({ className }: Props) => {
  return (
    <LenisProvider>
      <div className={cn("", className)}>
        <Hero />
        <ThreeCategories />
        <Blurb />
        <SecondHalf />
        <Footer />
      </div>
    </LenisProvider>
  );
};

export default Landing;
