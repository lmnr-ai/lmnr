import {
  Brain,
  Calculator,
  Code,
  Database,
  FileText,
  Globe,
  ImageIcon,
  ListTree,
  type LucideIcon,
  Mail,
  MessageCircle,
  Search,
  Settings,
  Shield,
  User,
  Zap,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  brain: Brain,
  "message-circle": MessageCircle,
  zap: Zap,
  search: Search,
  database: Database,
  "file-text": FileText,
  globe: Globe,
  shield: Shield,
  calculator: Calculator,
  code: Code,
  image: ImageIcon,
  mail: Mail,
  user: User,
  settings: Settings,
  "list-tree": ListTree,
};

export const ICON_DESCRIPTIONS = `Available icons (pick the most fitting one):
- brain: LLM reasoning, thinking, planning
- message-circle: Chat, conversation, dialogue
- zap: Tool execution, function calls, actions
- search: Search, retrieval, RAG, lookup
- database: Database ops, data storage, queries
- file-text: Document processing, parsing
- globe: Web requests, API calls, external services
- shield: Validation, safety, guardrails
- calculator: Math, computation, scoring
- code: Code generation, execution
- image: Image processing, vision
- mail: Email, notifications, messaging
- user: User interaction, auth
- settings: Configuration, setup, orchestration
- list-tree: Routing, dispatching, workflow`;
