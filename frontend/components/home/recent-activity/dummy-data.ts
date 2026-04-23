export interface ActivityNotification {
  id: string;
  type: "new_signal" | "new_cluster";
  title: string;
  signalName?: string;
  clusterColor?: string;
  eventCount?: number;
  timeAgo: string;
  createdAt: Date;
}

export const dummyNotifications: ActivityNotification[] = [
  {
    id: "1",
    type: "new_signal",
    title: "Browser Agent Errors",
    eventCount: 42,
    timeAgo: "4 hours ago",
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    id: "2",
    type: "new_cluster",
    title: "Inefficient Git commands",
    signalName: "Optimization Opportunities",
    clusterColor: "#c17aff",
    eventCount: 84,
    timeAgo: "8 hours ago",
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
  {
    id: "3",
    type: "new_cluster",
    title: "Slow API responses",
    signalName: "Optimization Opportunities",
    clusterColor: "#c17aff",
    eventCount: 56,
    timeAgo: "8 hours ago",
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
  {
    id: "4",
    type: "new_cluster",
    title: "Database connection timeouts",
    signalName: "Latency Spikes",
    clusterColor: "#ff4d4d",
    eventCount: 31,
    timeAgo: "12 hours ago",
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
  {
    id: "5",
    type: "new_signal",
    title: "Cost Anomalies",
    eventCount: 17,
    timeAgo: "1 day ago",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
];
