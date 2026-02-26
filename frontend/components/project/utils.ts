import {
  Database,
  FlaskConical,
  GitFork,
  LayoutGrid,
  Pen,
  PlayCircle,
  Radio,
  Rows4,
  Settings,
  SquareFunction,
  SquareTerminal,
} from "lucide-react";

export const getSidebarMenus = (projectId: string) => [
  {
    name: "dashboards",
    href: `/project/${projectId}/dashboard`,
    icon: LayoutGrid,
  },
  {
    name: "traces",
    href: `/project/${projectId}/traces`,
    icon: Rows4,
  },
  {
    name: "signals",
    href: `/project/${projectId}/signals`,
    icon: Radio,
  },
  {
    name: "evaluations",
    href: `/project/${projectId}/evaluations`,
    icon: FlaskConical,
  },
  {
    name: "evaluators",
    href: `/project/${projectId}/evaluators`,
    icon: SquareFunction,
  },
  {
    name: "datasets",
    href: `/project/${projectId}/datasets`,
    icon: Database,
  },
  {
    name: "labeling",
    href: `/project/${projectId}/labeling-queues`,
    icon: Pen,
  },
  {
    name: "sql editor",
    href: `/project/${projectId}/sql`,
    icon: SquareTerminal,
  },
  {
    name: "playgrounds",
    href: `/project/${projectId}/playgrounds`,
    icon: PlayCircle,
  },
  {
    name: "debugger",
    href: `/project/${projectId}/debugger-sessions`,
    icon: GitFork,
  },
  {
    name: "settings",
    href: `/project/${projectId}/settings`,
    icon: Settings,
  },
];
