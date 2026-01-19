"use client";

import { cn } from "@/lib/utils";

import Blurb from "./blurb";
import Footer from "./footer";
import Hero from "./hero";
import LenisProvider from "./lenis-provider";
import ThreeCategories from "./three-categories";

interface Props {
  className?: string;
  hasSession: boolean;
}

const Landing = ({ className, hasSession }: Props) => (
  <LenisProvider>
    <div className={cn("", className)}>
      <Hero hasSession={hasSession} />
      <ThreeCategories />
      <Blurb />
      {/*
      <SecondHalf />
      */}
      <Footer />
    </div>
  </LenisProvider>
);

export default Landing;
