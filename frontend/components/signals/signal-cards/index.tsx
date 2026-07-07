"use client";

import { motion } from "framer-motion";
import { useCallback } from "react";

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
  const toggleSelect = useCallback(
    (id: string) => {
      const next = { ...selectedIds };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );

  const enabledSignals = signals.filter((s) => s.enabled);
  const disabledSignals = signals.filter((s) => !s.enabled);

  const renderGrid = (items: SignalRow[]) => (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((signal, index) => (
        <motion.div
          key={signal.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.5) }}
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

  if (disabledSignals.length === 0) {
    return renderGrid(enabledSignals);
  }

  return (
    <div className="flex flex-col gap-6">
      {enabledSignals.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active ({enabledSignals.length})
          </h3>
          {renderGrid(enabledSignals)}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Disabled ({disabledSignals.length})
        </h3>
        {renderGrid(disabledSignals)}
      </div>
    </div>
  );
}
