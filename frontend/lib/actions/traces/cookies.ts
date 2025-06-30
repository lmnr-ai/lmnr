"use server";

import { cookies } from "next/headers";

import { TRACES_TRACE_VIEW_WIDTH } from "@/lib/actions/traces/index";

export const setTraceViewWidthCookie = async (width: number) => {
  const cookieStore = await cookies();
  cookieStore.set(TRACES_TRACE_VIEW_WIDTH, String(width));
};
