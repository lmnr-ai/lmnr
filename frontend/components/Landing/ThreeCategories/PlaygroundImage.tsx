import { cn } from "@/lib/utils";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import { Play, ChevronDown, Clock, Coins, CircleDollarSign, Bolt, X } from "lucide-react";

// Import logo SVGs for model icons
import claude from "@/assets/landing/logos/claude.svg";
import gemini from "@/assets/landing/logos/gemini.svg";
import openAi from "@/assets/landing/logos/open-ai.svg";

interface Props {
  className?: string;
}

const PlaygroundImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const offset = useTransform(scrollYProgress, [0, 0.25, 0.6, 1], [80, 60, -140, -160]);

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);

  // Transform the container horizontally based on scroll
  const x = useTransform(offset, (v) => `${v}px`);

  return (
    <div
      className={cn(
        "bg-landing-surface-700 overflow-hidden relative rounded-sm pb-0 pl-[100px] pr-0 pt-[80px]",
        className
      )}
      ref={ref}
    >
      {/* Fixed-size content container - positioned like Figma, then animated */}
      <motion.div className="absolute flex gap-[40px] left-[-132px] top-[80px]" style={{ x, opacity }}>
        {/* Left card - Trace/Span */}
        <div className="bg-landing-surface-600 border border-landing-surface-400 flex flex-col gap-4 items-start justify-center px-7 py-5 rounded-sm shrink-0 w-[548px]">
          {/* Header with openai.chat and Experiment button */}
          <div className="flex items-center justify-between shrink-0 w-full">
            <div className="flex gap-[10px] items-center shrink-0">
              <div className="bg-[#743fe3] opacity-50 flex items-center justify-center p-1 rounded-sm shrink-0 size-[30px]">
                <div className="shrink-0 size-5 text-white">💬</div>
              </div>
              <p className="font-sans font-normal leading-normal text-xl text-landing-text-300 whitespace-nowrap shrink-0">
                openai.chat
              </p>
              <ChevronDown className="shrink-0 size-4 text-landing-text-500" />
            </div>
            <div className="bg-landing-primary-400/10 border border-landing-primary-400/50 flex gap-2 items-center justify-center px-3 py-1.5 rounded-sm shrink-0">
              <Play className="shrink-0 size-4 text-landing-primary-400 fill-landing-primary-400" />
              <p className="font-sans font-normal leading-normal text-base text-landing-primary-400 whitespace-nowrap shrink-0">
                Experiment in playground
              </p>
              <ChevronDown className="shrink-0 size-4 text-landing-primary-400" />
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 items-start shrink-0">
            <div className="bg-landing-surface-500 border border-landing-text-600 flex gap-2 items-center justify-center px-3 py-1.5 rounded-sm shrink-0">
              <div className="flex gap-2 items-center shrink-0">
                <Clock className="shrink-0 size-4 text-landing-text-300" />
                <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                  123.36s
                </p>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                <Coins className="shrink-0 size-4 text-landing-text-300" />
                <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                  81k
                </p>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                <CircleDollarSign className="shrink-0 size-4 text-landing-text-300" />
                <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                  0.005
                </p>
              </div>
            </div>
            <div className="bg-landing-surface-500 border border-landing-text-600 flex items-center justify-center px-3 py-1.5 rounded-sm shrink-0">
              <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                9/5/2025, 9:08:31 AM
              </p>
            </div>
          </div>

          {/* Prompt text area */}
          <div className="bg-landing-surface-500/50 border border-landing-surface-400 flex items-center justify-center px-3 py-1.5 rounded-sm shrink-0 w-full">
            <div className="basis-0 font-chivo-mono font-normal grow leading-[22px] min-h-px min-w-px shrink-0 text-base text-landing-text-500">
              <p className="mb-0">
                You are an AI agent designed to operate in an iterative loop to automate browser tasks. Your ultimate
                goal is accomplishing the task provided in &lt;user_request&gt;.
              </p>
              <p className="mb-0">&nbsp;</p>
              <p className="mb-0">&lt;intro&gt;</p>
              <p className="mb-0">You excel at following tasks:</p>
              <p className="mb-0">1. Navigating complex websites and extracting precise information</p>
              <p className="mb-0">2. Automating form submissions and interactive web actions</p>
              <p className="mb-0">3. Gathering and saving information</p>
              <p className="mb-0">4. Using your filesystem effectively to decide what to keep in your context</p>
              <p className="mb-0">5. Operate effectively in an agent loop</p>
              <p className="mb-0">6. Efficiently performing diverse web tasks</p>
              <p>&lt;/intro&gt;</p>
            </div>
          </div>
        </div>

        {/* Right card - Playground */}
        <div className="bg-landing-surface-600 border border-landing-surface-400 flex flex-col gap-4 h-[368px] items-start px-7 py-5 rounded-sm shrink-0 w-[685px] relative">
          {/* Breadcrumb */}
          <div className="flex font-normal gap-3 items-start leading-normal shrink-0 text-base whitespace-nowrap">
            <p className="font-sans not-italic relative shrink-0 text-landing-text-500">playgrounds</p>
            <p className="font-sans relative shrink-0 text-landing-text-500">/</p>
            <p className="font-sans not-italic relative shrink-0 text-landing-text-300">my_playground</p>
          </div>

          {/* Model selector and tools */}
          <div className="flex gap-2 items-start shrink-0">
            <div className="bg-landing-surface-500 border border-landing-text-600 flex gap-2 items-center justify-center px-3 py-1.5 rounded-sm shrink-0">
              <Image src={gemini} alt="Gemini" width={16} height={16} className="shrink-0 size-4 object-contain" />
              <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                Gemini 2.5 Pro
              </p>
              <ChevronDown className="shrink-0 size-4 text-landing-text-500" />
            </div>
            <div className="bg-landing-primary-400/10 border border-landing-primary-400/50 flex items-center justify-center relative rounded-sm shrink-0">
              <div className="flex flex-row items-center self-stretch">
                <div className="flex gap-2 h-full items-center justify-center px-3 py-1.5 relative shrink-0">
                  <Bolt className="shrink-0 size-4 text-landing-primary-400 fill-landing-primary-400" />
                  <p className="font-sans font-normal leading-normal text-base text-landing-primary-400 whitespace-nowrap shrink-0">
                    2 tools
                  </p>
                </div>
              </div>
              <div className="flex flex-row items-center self-stretch">
                <div className="border-l border-landing-primary-400/50 flex h-full items-center justify-center px-3 py-1.5 relative shrink-0">
                  <X className="shrink-0 size-4 text-landing-primary-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Prompt text area */}
          <div className="bg-landing-surface-500/50 border border-landing-surface-400 flex items-center justify-center px-3 py-1.5 rounded-sm shrink-0 w-full">
            <div className="basis-0 font-sans font-normal grow leading-[22px] min-h-px min-w-px not-italic relative shrink-0 text-base text-landing-text-500">
              <p className="mb-0">
                You are world expert in identifying most useful content from JSON show user on our AI observability
                platform.
              </p>
              <p className="mb-0">&nbsp;</p>
              <p className="mb-0">
                Your goal is to produce a moustache syntax to extract single most useful and informative string from
                context.
              </p>
              <p className="mb-0">&nbsp;</p>
              <p>Answer strictly with moustache syntax only. Something like {`{{input}}`}</p>
            </div>
          </div>

          {/* Model dropdown menu */}
          <div className="absolute bg-landing-surface-400 border border-landing-surface-400 flex flex-col gap-2 items-start justify-center left-[27px] px-3 py-1.5 rounded-sm shadow-[0px_6px_18px_0px_rgba(0,0,0,0.25)] top-[95px] z-10">
            <div className="flex gap-2 items-center relative shrink-0">
              <Image src={claude} alt="Claude" width={16} height={16} className="shrink-0 size-4 object-contain" />
              <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                Claude 4.5 Sonnet
              </p>
            </div>
            <div className="flex gap-2 items-center relative shrink-0">
              <Image src={openAi} alt="OpenAI" width={16} height={16} className="shrink-0 size-4 object-contain" />
              <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                GPT-5
              </p>
            </div>
            <div className="flex gap-2 items-center relative shrink-0">
              <Image src={gemini} alt="Gemini" width={16} height={16} className="shrink-0 size-4 object-contain" />
              <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
                Gemini 2.5 Pro
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 w-full">
        <div className="bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 h-[283px] w-full" />
      </div>
    </div>
  );
};

export default PlaygroundImage;
