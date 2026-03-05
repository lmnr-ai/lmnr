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
  SquareTerminal,
} from "lucide-react";

export const getSidebarMenus = (projectId: string) => [
  {
    name: "Dashboards",
    href: `/project/${projectId}/dashboard`,
    icon: LayoutGrid,
  },
  {
    name: "Traces",
    href: `/project/${projectId}/traces`,
    icon: Rows4,
  },
  {
    name: "Signals",
    href: `/project/${projectId}/signals`,
    icon: Radio,
  },
  {
    name: "Evaluations",
    href: `/project/${projectId}/evaluations`,
    icon: FlaskConical,
  },
  {
    name: "Datasets",
    href: `/project/${projectId}/datasets`,
    icon: Database,
  },
  {
    name: "Labeling",
    href: `/project/${projectId}/labeling-queues`,
    icon: Pen,
  },
  {
    name: "SQL editor",
    href: `/project/${projectId}/sql`,
    icon: SquareTerminal,
  },
  {
    name: "Playgrounds",
    href: `/project/${projectId}/playgrounds`,
    icon: PlayCircle,
  },
  {
    name: "Debugger",
    href: `/project/${projectId}/debugger-sessions`,
    icon: GitFork,
  },
  {
    name: "Settings",
    href: `/project/${projectId}/settings`,
    icon: Settings,
  },
];
