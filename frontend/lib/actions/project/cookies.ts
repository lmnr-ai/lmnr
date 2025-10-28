"use server";

import { cookies } from "next/headers";

import { LAST_PROJECT_ID, MAX_AGE } from "@/lib/actions/project/index.ts";

export const getLastProjectIdCookie = async (): Promise<string | undefined> => {
  const cookieStore = await cookies();
  return cookieStore.get(LAST_PROJECT_ID)?.value;
};

export const setLastProjectIdCookie = async (projectId: string) => {
  const cookieStore = await cookies();
  cookieStore.set(LAST_PROJECT_ID, projectId, {
    maxAge: MAX_AGE,
  });
};

