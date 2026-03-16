"use client";

import { motion } from "framer-motion";

import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";

import SignalCard from "./signal-card";

interface SignalCardsProps {
  signals: SignalRow[];
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
  selectedIds: Record<string, boolean>;
  onSelectionChange: (ids: Record<string, boolean>) => void;
}

export default function SignalCards({
  signals,
  projectId,
  sparklineData,
  sparklineMaxCount,
  selectedIds,
  onSelectionChange,
}: SignalCardsProps) {
  const toggleSelect = (id: string) => {
    const next = { ...selectedIds };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    onSelectionChange(next);
  };

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {signals.map((signal, index) => (
        <motion.div
          key={signal.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: index * 0.03 }}
        >
          <SignalCard
            signal={signal}
            projectId={projectId}
            sparklineData={sparklineData}
            sparklineMaxCount={sparklineMaxCount}
            isSelected={!!selectedIds[signal.id]}
            onToggleSelect={() => toggleSelect(signal.id)}
          />
        </motion.div>
      ))}
    </div>
  );
}
