"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { CLUSTER_NAMES, generateClusterRows } from "./dummydata";

const ClustersPanel = () => {
  const [openCluster, setOpenCluster] = useState<string | null>("Misinterpreted user request");

  return (
    <div className="bg-[#1b1b1c] border border-[#2e2e2f] flex flex-col items-start overflow-hidden rounded w-full h-[80%]">
      <div className="flex items-center pb-2 pl-4 pr-4 pt-4 md:pb-3 md:pl-6 md:pr-5 md:pt-5 shrink-0">
        <p className="font-sans font-medium text-lg md:text-xl text-landing-text-300">Clusters</p>
      </div>
      <div className="bg-[rgba(37,37,38,0.5)] border-t border-landing-surface-400 flex flex-col items-start w-full flex-1 min-h-0 overflow-hidden">
        {CLUSTER_NAMES.map((clusterName, ci) => {
          const isOpen = openCluster === clusterName;
          const rows = generateClusterRows(ci);

          return (
            <div key={clusterName} className={`w-full ${isOpen ? "flex-1 min-h-0 flex flex-col" : "shrink-0"}`}>
              {/* Cluster header */}
              <button
                onClick={() => setOpenCluster(isOpen ? null : clusterName)}
                className="border-b border-landing-surface-400 flex items-center justify-between pl-4 pr-2 py-1.5 md:pl-6 md:py-2 w-full transition-colors shrink-0"
              >
                <p className="font-sans text-[10px] md:text-xs text-landing-primary-400">{clusterName}</p>
                {isOpen ? (
                  <ChevronDown className="size-3.5 md:size-4 text-landing-primary-400" />
                ) : (
                  <ChevronRight className="size-3.5 md:size-4 text-landing-primary-400" />
                )}
              </button>
              {/* Expanded rows */}
              {isOpen && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="bg-[#1b1b1c] flex flex-col items-start w-full h-full overflow-y-auto no-scrollbar">
                    {rows.map((row, ri) => (
                      <div
                        key={ri}
                        className="border-b border-landing-surface-400 flex items-start px-4 md:px-6 w-full shrink-0"
                      >
                        <div className="flex items-center py-1.5 md:py-2 shrink-0 w-[90px] md:w-[120px]">
                          <p className="font-sans text-sm md:text-base text-landing-text-300 whitespace-nowrap">
                            {row.timestamp}
                          </p>
                        </div>
                        <div className="flex items-center py-1.5 md:py-2 shrink-0 w-[90px] md:w-[120px]">
                          <p className="font-sans text-sm md:text-base text-landing-text-300">{row.category}</p>
                        </div>
                        <div className="flex flex-1 items-center min-w-0 py-1.5 md:py-2">
                          <p className="font-sans text-sm md:text-base text-landing-text-300 truncate">{row.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClustersPanel;
