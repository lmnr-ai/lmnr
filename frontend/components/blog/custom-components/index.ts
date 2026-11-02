import Callout from "./callout";
import { CostBar, CostChart } from "./cost-chart";
import Grade from "./grade";
import MultiModelPipeline from "./multi-model-pipeline";
import { ActualIssue, SignalEvent, SignalResults } from "./signal-results";
import SignalsPipeline from "./signals-pipeline";
import { Stat, StatGrid } from "./stat-grid";
import { Step, Steps } from "./steps";
import { Tab, Tabs } from "./tabs";
import { TraceTab, TraceTabs } from "./trace-tabs";

// Tags usable as JSX in Strapi post content. An unregistered tag fails the
// whole MDX render, so rename here only alongside the posts that use it.
export const blogComponents = {
  ActualIssue,
  Callout,
  CostBar,
  CostChart,
  Grade,
  MultiModelPipeline,
  SignalEvent,
  SignalResults,
  SignalsPipeline,
  Stat,
  StatGrid,
  Step,
  Steps,
  Tab,
  Tabs,
  TraceTab,
  TraceTabs,
};
