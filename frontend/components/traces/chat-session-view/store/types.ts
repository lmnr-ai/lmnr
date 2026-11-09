import { type LayoutSlice } from "./layout";
import { type TimelineSlice } from "./timeline";

/** The chat session view's UI state: the session timeline and the trace panel layout. Data lives in SWR (`../data`). */
export type ChatSessionState = TimelineSlice & LayoutSlice & { sessionId: string };
