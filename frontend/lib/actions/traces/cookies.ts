"use server";

import { cookies } from "next/headers";

import { EVENTS_TRACE_VIEW_WIDTH, TRACES_TRACE_VIEW_WIDTH } from "@/lib/actions/traces/index";

export const setTraceViewWidthCookie = async (width: number) => {
  const cookieStore = await cookies();
  cookieStore.set(TRACES_TRACE_VIEW_WIDTH, String(width));
};

export const setEventsTraceViewWidthCookie = async (width: number) => {
  const cookieStore = await cookies();
  cookieStore.set(EVENTS_TRACE_VIEW_WIDTH, String(width));
};
