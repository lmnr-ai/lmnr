"use server";

import { cookies } from "next/headers";

import { LAST_ID_COOKIE_MAX_AGE, LAST_WORKSPACE_ID } from "@/lib/cookies";

export const getLastWorkspaceIdCookie = async (): Promise<string | undefined> => {
  const cookieStore = await cookies();
  return cookieStore.get(LAST_WORKSPACE_ID)?.value;
};

export const setLastWorkspaceIdCookie = async (workspaceId: string) => {
  const cookieStore = await cookies();
  cookieStore.set(LAST_WORKSPACE_ID, workspaceId, {
    maxAge: LAST_ID_COOKIE_MAX_AGE,
  });
};

export const deleteLastWorkspaceIdCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_WORKSPACE_ID);
};
