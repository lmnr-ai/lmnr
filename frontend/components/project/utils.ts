import {
  Database,
  FlaskConical,
  GitBranch,
  GitFork,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Pen,
  PlayCircle,
  Radio,
  Rows4,
  SquareTerminal,
} from "lucide-react";

export interface SidebarMenuOption {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface SidebarMenuGroup {
  label?: string;
  items: SidebarMenuOption[];
}

export const getSidebarMenus = (projectId: string): SidebarMenuGroup[] => [
  {
    items: [
      { name: "home", href: `/project/${projectId}/home`, icon: Home },
      { name: "dashboards", href: `/project/${projectId}/dashboards`, icon: LayoutDashboard },
    ],
  },
  {
    label: "Investigate",
    items: [
      { name: "traces", href: `/project/${projectId}/traces`, icon: Rows4 },
      { name: "signals", href: `/project/${projectId}/signals`, icon: Radio },
      { name: "sql editor", href: `/project/${projectId}/sql`, icon: SquareTerminal },
      { name: "agent versions", href: `/project/${projectId}/agent-versions`, icon: GitBranch, badge: "beta" },
    ],
  },
  {
    label: "Improve",
    items: [
      { name: "evaluations", href: `/project/${projectId}/evaluations`, icon: FlaskConical },
      { name: "datasets", href: `/project/${projectId}/datasets`, icon: Database },
      { name: "labeling", href: `/project/${projectId}/labeling-queues`, icon: Pen },
      { name: "playgrounds", href: `/project/${projectId}/playgrounds`, icon: PlayCircle },
      { name: "debugger", href: `/project/${projectId}/debugger-sessions`, icon: GitFork },
    ],
  },
];
