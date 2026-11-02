"use server";

import { cookies } from "next/headers";

import { LAST_PROJECT_ID } from "@/lib/cookies";

export const getLastProjectIdCookie = async (): Promise<string | undefined> => {
  const cookieStore = await cookies();
  return cookieStore.get(LAST_PROJECT_ID)?.value;
};

export const deleteLastProjectIdCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_PROJECT_ID);
};
