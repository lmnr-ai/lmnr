import { Brain, Code, Database, FileText, type LucideIcon, MessageCircle, Search, Shield, Zap } from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  brain: Brain,
  "message-circle": MessageCircle,
  zap: Zap,
  search: Search,
  database: Database,
  "file-text": FileText,
  shield: Shield,
  code: Code,
};

export const ICON_DESCRIPTIONS = `Available icons — you MUST pick exactly one from this list:
- brain: Reasoning, thinking, planning, decision-making
- message-circle: Chat, conversation, dialogue, user interaction
- zap: Tool calls, function execution, actions, API requests
- search: Search, retrieval, lookup, web browsing, RAG
- database: Database queries, data storage, caching
- file-text: Document processing, parsing, reading, writing files
- shield: Validation, safety checks, guardrails, error handling
- code: Code generation, code execution, computation`;
