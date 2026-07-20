import {
  Database,
  FlaskConical,
  GitFork,
  Home,
  LayoutDashboard,
  Pen,
  PlayCircle,
  Radio,
  Rows4,
  Settings,
  SquareTerminal,
} from "@/components/ui/icon-lib";

export const getSidebarMenus = (projectId: string) => [
  {
    name: "home",
    href: `/project/${projectId}/home`,
    icon: Home,
  },
  {
    name: "dashboards",
    href: `/project/${projectId}/dashboards`,
    icon: LayoutDashboard,
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
