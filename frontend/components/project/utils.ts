import {
  Database,
  FlaskConical,
  GitBranch,
  GitFork,
  LayoutDashboard,
  type LucideIcon,
  Pen,
  PlayCircle,
  Radio,
  Rows4,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { type ComponentType } from "react";

import AgentIcon from "@/components/agent/agent-icon";

export interface SidebarMenuOption {
  name: string;
  href: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  badge?: string;
}

export interface SidebarMenuGroup {
  label?: string;
  items: SidebarMenuOption[];
}

export const getSidebarMenus = (projectId: string): SidebarMenuGroup[] => [
  {
    items: [
      { name: "Agent", href: `/project/${projectId}/home`, icon: AgentIcon },
      { name: "Dashboards", href: `/project/${projectId}/dashboards`, icon: LayoutDashboard },
    ],
  },
  {
    label: "Investigate",
    items: [
      { name: "Traces", href: `/project/${projectId}/traces`, icon: Rows4 },
      { name: "Signals", href: `/project/${projectId}/signals`, icon: Radio },
      { name: "SQL editor", href: `/project/${projectId}/sql`, icon: SquareTerminal },
      { name: "Agent versions", href: `/project/${projectId}/agent-versions`, icon: GitBranch, badge: "beta" },
    ],
  },
  {
    label: "Improve",
    items: [
      { name: "Evaluations", href: `/project/${projectId}/evaluations`, icon: FlaskConical },
      { name: "Datasets", href: `/project/${projectId}/datasets`, icon: Database },
      { name: "Labeling", href: `/project/${projectId}/labeling-queues`, icon: Pen },
      { name: "Playgrounds", href: `/project/${projectId}/playgrounds`, icon: PlayCircle },
      { name: "Debugger", href: `/project/${projectId}/debugger-sessions`, icon: GitFork },
    ],
  },
  {
    label: "Settings",
    items: [{ name: "Settings", href: `/project/${projectId}/settings`, icon: Settings }],
  },
];
