import { motion } from "framer-motion";
import { FormEvent, memo } from "react";

import { Button } from "@/components/ui/button";

interface SuggestionsProps {
  sessionId: string;
  onSubmit: (suggestion: string, e?: FormEvent<HTMLFormElement>) => void;
}

const Suggestions = ({ sessionId, onSubmit }: SuggestionsProps) => {
  const suggestions = [
    {
      title: "Research NVIDIA stock",
      action: "Research NVIDIA stock",
    },
    {
      title: "Create a spreadsheet from YC companies",
      action: `Go to ycombinator.com and search for first 3 companies in X25 batch. Create a google spreadsheet with company names and their descriptions.`,
    },
    {
      title: "Find me cheapest tickets from Seoul to London",
      action: `Find me cheapest tickets from Seoul to London`,
    },
    {
      title: "Organize a trip to Sicily",
      action: "Organize a 7 day trip to Sicily in about a month from now. Find affordable hotels and flights. Plan for 2 people.",
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-2 w-full mx-auto md:max-w-3xl px-4">
      {suggestions.map((suggestion, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggestion-${suggestion.title}`}
        >
          <Button
            title={suggestion.action}
            variant="ghost"
            onClick={() => onSubmit(suggestion.action)}
            className="overflow-hidden text-left border hover:bg-muted/70 rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
          >
            <span className="font-medium truncate">{suggestion.title}</span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
};

export default memo(Suggestions);
