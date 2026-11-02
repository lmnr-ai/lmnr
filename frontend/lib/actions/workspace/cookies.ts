"use server";

import { cookies } from "next/headers";

import { LAST_WORKSPACE_ID } from "@/lib/cookies";

export const getLastWorkspaceIdCookie = async (): Promise<string | undefined> => {
  const cookieStore = await cookies();
  return cookieStore.get(LAST_WORKSPACE_ID)?.value;
};

export const deleteLastWorkspaceIdCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_WORKSPACE_ID);
};
