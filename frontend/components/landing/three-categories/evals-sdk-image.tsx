"use client";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const EvalsSDKImage = ({ className }: Props) => (
  <div
    className={cn("bg-landing-surface-700 flex items-start overflow-clip px-10 py-[30px] rounded relative", className)}
  >
    <div className="absolute flex flex-col items-start left-[83px] top-10">
      <div className="bg-landing-surface-500 border border-landing-text-600 flex font-mono gap-[14px] items-start px-2 py-1 rounded text-base">
        {/* Line numbers */}
        <div className="text-landing-text-500 leading-normal">
          {[...Array(15)].map((_, i) => (
            <p key={i} className="mb-0">
              {i + 1}
            </p>
          ))}
        </div>

        {/* Code content */}
        <div className="text-landing-text-300 leading-normal whitespace-pre">
          <p className="mb-0">
            <span className="text-landing-primary-400">evaluate</span>
            <span>{"({"}</span>
          </p>
          <p className="mb-0">{"  data: dataset,"}</p>
          <p className="mb-0">{"  executor: capitalOfCountry,"}</p>
          <p className="mb-0">{"  evaluators: {"}</p>
          <p className="mb-0">{"    accuracy: (output: string, target: string | undefined): number => {"}</p>
          <p className="mb-0">{"      if (!target) return 0;"}</p>
          <p className="mb-0">{"      return output.includes(target) ? 1 : 0;"}</p>
          <p className="mb-0">{"    },"}</p>
          <p className="mb-0">{"  },"}</p>
          <p className="mb-0">{"  config: {"}</p>
          <p className="mb-0">{"    instrumentModules: {"}</p>
          <p className="mb-0">{"      openAI: OpenAI"}</p>
          <p className="mb-0">{"    }"}</p>
          <p className="mb-0">{"  }"}</p>
          <p className="mb-0">{"})"}</p>
        </div>
      </div>
    </div>

    {/* Gradient fade on right side */}
    <div className="bg-gradient-to-t from-landing-surface-700 to-transparent h-[60%] w-full absolute bottom-0" />
  </div>
);

export default EvalsSDKImage;
