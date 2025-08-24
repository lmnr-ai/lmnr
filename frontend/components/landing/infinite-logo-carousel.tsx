"use client";

import Image, { StaticImageData } from "next/image";
import { useEffect, useRef } from "react";

import amplitude from "@/assets/landing/companies/amplitude.png";
import remo from "@/assets/landing/companies/remo.svg";
import skyvern from "@/assets/landing/companies/skyvern.webp";
import { LogoBrowserUse, LogoRye } from "@/components/ui/icons";
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
    className: "w-40 h-10"
  },
  {
    id: "browser-use",
    name: "Browser Use",
    component: LogoBrowserUse,
    className: "w-40 h-10"
  },
  {
    id: "remo",
    name: "Remo",
    image: remo,
    className: "w-20 h-8"
  },
  {
    id: "rye",
    name: "Rye",
    component: LogoRye,
    className: "w-20 h-6"
  },
  {
    id: "skyvern",
    name: "Skyvern",
    image: skyvern,
    className: "w-32 h-10"
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
      return (
        <Image
          src={logo.image}
          alt={logo.name}
          className={cn("object-cover object-center", logo.className)}
        />
      );
    }

    return null;
  };

  return (
    <div className="relative overflow-hidden max-w-[1200px] w-full">
      {/* Fade gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      {/* Scrolling container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-12 overflow-hidden whitespace-nowrap py-8"
        style={{ scrollBehavior: 'auto' }}
      >
        {/* First set of logos */}
        {logos.map((logo) => (
          <div key={`first-${logo.id}`} className="flex-shrink-0 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity duration-300">
            <LogoComponent logo={logo} />
          </div>
        ))}

        {/* Duplicate set for seamless loop */}
        {logos.map((logo) => (
          <div key={`second-${logo.id}`} className="flex-shrink-0 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity duration-300">
            <LogoComponent logo={logo} />
          </div>
        ))}

        {/* Third set to ensure smooth transition */}
        {logos.map((logo) => (
          <div key={`third-${logo.id}`} className="flex-shrink-0 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity duration-300">
            <LogoComponent logo={logo} />
          </div>
        ))}
      </div>
    </div>
  );
}
