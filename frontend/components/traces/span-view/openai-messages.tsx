import React from "react";
import { z } from "zod";

import { OpenAIMessagesSchema } from "@/lib/spans/types";

interface OpenaiMessagesProps {
  messages: z.infer<typeof OpenAIMessagesSchema>;
}
const OpenaiMessages = ({ messages}: OpenaiMessagesProps) => {
  const abc = ";";

  switch (messages) {

      case():
  }
  return <div>here</div>;
};

export default OpenaiMessages;
