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
  onEdit: (signal: SignalRow) => void;
  onDelete: (signalId: string) => void;
}

export default function SignalCards({
  signals,
  projectId,
  sparklineData,
  sparklineMaxCount,
  onEdit,
  onDelete,
}: SignalCardsProps) {
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {signals.map((signal, index) => (
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
            onEdit={() => onEdit(signal)}
            onDelete={() => onDelete(signal.id)}
          />
        </motion.div>
      ))}
    </div>
  );
}
