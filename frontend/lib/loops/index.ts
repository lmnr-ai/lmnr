import { Feature, isFeatureEnabled } from "@/lib/features/features";

// Update endpoint, not create: it upserts, so a contact that already exists in
// the audience (e.g. subscribed via marketing) gets its userId attached instead
// of a 409 Conflict.
const LOOPS_UPSERT_CONTACT_URL = "https://app.loops.so/api/v1/contacts/update";

const LOOPS_REQUEST_TIMEOUT_MS = 5_000;

interface CreateLoopsContactArgs {
  email: string;
  userId: string;
  name?: string | null;
  createdAt?: Date | string | null;
}

const splitName = (name?: string | null): { firstName?: string; lastName?: string } => {
  const trimmed = name?.trim();
  if (!trimmed) {
    return {};
  }
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
};

export const createLoopsContact = async ({ email, userId, name, createdAt }: CreateLoopsContactArgs): Promise<void> => {
  if (!isFeatureEnabled(Feature.LOOPS)) {
    return;
  }

  try {
    const { firstName, lastName } = splitName(name);
    const createdAtIso = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();

    const response = await fetch(LOOPS_UPSERT_CONTACT_URL, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        userId,
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        createdAt: createdAtIso,
      }),
      // Bound the wait so a slow Loops API can't stall sign-up.
      signal: AbortSignal.timeout(LOOPS_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`Failed to upsert Loops contact (${response.status}): ${body}`);
    }
  } catch (error) {
    // Audience sync failures must never break sign-up.
    console.warn("Failed to upsert Loops contact", error);
  }
};
