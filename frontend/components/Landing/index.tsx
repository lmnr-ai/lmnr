"use client";

import { cn } from "@/lib/utils";
import Hero from "./Hero";
import ThreeCategories from "./ThreeCategories";
import Blurb from "./Blurb";
import SecondHalf from "./SecondHalf";
import Footer from "./Footer";
import LenisProvider from "./LenisProvider";

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
