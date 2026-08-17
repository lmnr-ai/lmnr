import { type ComponentType } from "react";

import { type CardId } from "../cards";
import AnnotationA from "./annotation-a";
import AnnotationB from "./annotation-b";
import AnnotationC from "./annotation-c";
import DashboardsA from "./dashboards-a";
import DashboardsB from "./dashboards-b";
import DashboardsC from "./dashboards-c";
import InputExtractionA from "./input-extraction-a";
import InputExtractionB from "./input-extraction-b";
import InputExtractionC from "./input-extraction-c";
import ScreenRecordingA from "./screen-recording-a";
import ScreenRecordingB from "./screen-recording-b";
import ScreenRecordingC from "./screen-recording-c";
import SearchA from "./search-a";
import SearchB from "./search-b";
import SearchC from "./search-c";
import SqlA from "./sql-a";
import SqlB from "./sql-b";
import SqlC from "./sql-c";

export const VARIANTS = ["a", "b", "c"] as const;
export type Variant = (typeof VARIANTS)[number];

// One graphic per (card, variant). Every entry fills the card's graphic frame,
// which is `relative overflow-hidden` — graphics are free to overflow it.
export const GRAPHICS: Record<CardId, Record<Variant, ComponentType>> = {
  "input-extraction": { a: InputExtractionA, b: InputExtractionB, c: InputExtractionC },
  dashboards: { a: DashboardsA, b: DashboardsB, c: DashboardsC },
  sql: { a: SqlA, b: SqlB, c: SqlC },
  annotation: { a: AnnotationA, b: AnnotationB, c: AnnotationC },
  "screen-recording": { a: ScreenRecordingA, b: ScreenRecordingB, c: ScreenRecordingC },
  search: { a: SearchA, b: SearchB, c: SearchC },
};
