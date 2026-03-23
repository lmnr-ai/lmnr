"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const DashboardImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Pan from top-left (0%, 0%) to bottom-right (100%, 100%)
  // Since image is 140% of container, we can pan 40% in each direction
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5, 1], ["80px", "30px", "10px"]);
  const graphsY = useTransform(scrollYProgress, [0, 0.3, 0.5, 1], ["0px", "-10px", "-100px", "-400px"]);

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-sm outline outline-landing-surface-500 bg-landing-surface-600",
        className
      )}
    >
      <motion.div
        className="relative w-[140%] bg-background h-[200%] left-[40px] rounded-sm overflow-hidden"
        style={{ y, opacity }}
      >
        <motion.img
          src="/assets/landing/dashboards-graphs.png"
          alt="Dashboard graphs"
          className="absolute top-0 left-0 w-full object-contain"
          style={{ y: graphsY }}
        />
        <Image
          src="/assets/landing/dashboards-frame.png"
          alt="Dashboard"
          width={600}
          height={400}
          className="absolute left-0 top-0 w-full object-contain"
        />
      </motion.div>
      {/* Gradient overlay at bottom left */}
      <div className="absolute bottom-0 left-0 flex h-[80%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700/60  to-landing-surface-700/0" />
    </div>
  );
};

export default DashboardImage;
