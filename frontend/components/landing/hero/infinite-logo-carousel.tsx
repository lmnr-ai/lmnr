"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef } from "react";

import amplitude from "@/assets/landing/companies/amplitude.png";
import skyvern from "@/assets/landing/companies/skyvern.webp";
import { LogoAxionRay, LogoBrowserUse, LogoRemo, LogoRye } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Logo {
  id: string;
  name: string;
  image?: StaticImageData;
  component?: React.ComponentType<{ className?: string }>;
  className?: string;
}

const logos: Logo[] = [
  {
    id: "amplitude",
    name: "Amplitude",
    image: amplitude,
    className: "md:w-32 md:h-8 w-24 h-6",
  },
  {
    id: "browser-use",
    name: "Browser Use",
    component: LogoBrowserUse,
    className: "md:w-32 md:h-8 w-24 h-6",
  },
  {
    id: "rye",
    name: "Rye",
    component: LogoRye,
    className: "md:w-16 md:h-5 w-12 h-4",
  },
  {
    id: "skyvern",
    name: "Skyvern",
    image: skyvern,
    className: "md:w-24 md:h-8 w-18 h-6",
  },
  {
    id: "axion-ray",
    name: "Axion Ray",
    component: LogoAxionRay,
    className: "md:w-24 md:h-8 w-18 h-6",
  },
  {
    id: "remo",
    name: "Remo",
    component: LogoRemo,
    className: "md:w-20 md:h-7 w-14 h-5",
  },
];

export default function InfiniteLogoCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationId: number;
    let scrollPosition = 0;
    const scrollSpeed = 0.5; // pixels per frame

    const animate = () => {
      scrollPosition += scrollSpeed;

      // Get the width of one complete set of logos
      const oneSetWidth = scrollContainer.scrollWidth / 3; // We have 3 sets

      // Reset position when we've scrolled through one complete set
      if (scrollPosition >= oneSetWidth) {
        scrollPosition = 0;
      }

      scrollContainer.scrollLeft = scrollPosition;
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

  const LogoComponent = ({ logo }: { logo: Logo }) => {
    if (logo.component) {
      const Component = logo.component;
      return <Component className={logo.className} />;
    }

    if (logo.image) {
      return <Image src={logo.image} alt={logo.name} className={cn("object-cover object-center", logo.className)} />;
    }

    return null;
  };

  return (
    <div className="relative overflow-hidden w-screen xl:max-w-[1000px] 2xl:max-w-[1200px]">
      {/* Fade gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-linear-to-r from-landing-surface-900 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-linear-to-l from-landing-surface-900 to-transparent z-10 pointer-events-none" />

      {/* Scrolling container */}
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center md:gap-12 overflow-hidden whitespace-nowrap md:py-8",
          "gap-8 py-6"
        )}
        style={{ scrollBehavior: "auto" }}
      >
        {/* First set of logos */}
        {logos.map((logo) => (
          <div
            key={`first-${logo.id}`}
            className="shrink-0 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity duration-300"
          >
            <LogoComponent logo={logo} />
          </div>
        ))}

        {/* Duplicate set for seamless loop */}
        {logos.map((logo) => (
          <div
            key={`second-${logo.id}`}
            className="shrink-0 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity duration-300"
          >
            <LogoComponent logo={logo} />
          </div>
        ))}

        {/* Third set to ensure smooth transition */}
        {logos.map((logo) => (
          <div
            key={`third-${logo.id}`}
            className="shrink-0 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity duration-300"
          >
            <LogoComponent logo={logo} />
          </div>
        ))}
      </div>
    </div>
  );
}
