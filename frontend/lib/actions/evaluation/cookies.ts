"use server";

import { cookies } from "next/headers";

import { EVALUATION_TRACE_VIEW_WIDTH } from "@/lib/actions/evaluation";

export const setTraceViewWidthCookie = async (width: number) => {
  const cookieStore = await cookies();
  cookieStore.set(EVALUATION_TRACE_VIEW_WIDTH, String(width));
};
