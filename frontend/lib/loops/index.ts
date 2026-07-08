import { Feature, isFeatureEnabled } from "@/lib/features/features";

const LOOPS_CREATE_CONTACT_URL = "https://app.loops.so/api/v1/contacts/create";

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

    const response = await fetch(LOOPS_CREATE_CONTACT_URL, {
      method: "POST",
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
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`Failed to create Loops contact (${response.status}): ${body}`);
    }
  } catch (error) {
    // Audience sync failures must never break sign-up.
    console.warn("Failed to create Loops contact", error);
  }
};
