// Client-safe: no server imports. Infers a user's organization from their email.

// Second-level labels that belong to the public suffix, not the org
// (acme.co.uk, acme.com.au, acme.ac.jp).
const PUBLIC_SECOND_LEVEL_LABELS = new Set(["co", "com", "net", "org", "edu", "gov", "ac", "or", "ne", "gob", "govt"]);

// Consumer mail providers, matched on the org label so every ccTLD variant
// (yahoo.com, yahoo.co.uk, yahoo.fr, …) is covered by one entry.
const CONSUMER_EMAIL_PROVIDERS = new Set([
  "126",
  "163",
  "aol",
  "duck",
  "fastmail",
  "gmail",
  "gmx",
  "googlemail",
  "hey",
  "hotmail",
  "icloud",
  "live",
  "mail",
  "mailbox",
  "me",
  "msn",
  "naver",
  "outlook",
  "pm",
  "posteo",
  "proton",
  "protonmail",
  "qq",
  "rambler",
  "seznam",
  "tuta",
  "tutanota",
  "web",
  "yahoo",
  "yandex",
  "ymail",
  "zoho",
]);

// Academic addresses name the school, not the team building the agent.
const ACADEMIC_LABELS = new Set(["edu", "ac"]);

const capitalize = (label: string): string =>
  label
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-");

// "ada@eng.acme.co.uk" -> "acme.co.uk"; consumer, academic or malformed -> null.
export const orgDomainFromEmail = (email?: string | null): string | null => {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 0) return null;

  const labels = email!
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .split(".")
    .filter(Boolean);
  if (labels.length < 2) return null;
  if (labels.some((label) => !/^[a-z0-9-]+$/.test(label))) return null;

  // Drop the TLD, then a public second-level label; whatever is last is the org.
  const suffix = [labels.pop()!];
  if (ACADEMIC_LABELS.has(suffix[0])) return null;
  if (labels.length > 1 && PUBLIC_SECOND_LEVEL_LABELS.has(labels[labels.length - 1])) {
    const secondLevel = labels.pop()!;
    if (ACADEMIC_LABELS.has(secondLevel)) return null;
    suffix.unshift(secondLevel);
  }

  const org = labels[labels.length - 1];
  if (!org || CONSUMER_EMAIL_PROVIDERS.has(org)) return null;
  return [org, ...suffix].join(".");
};

// "ada@acme.co.uk" -> "Acme"; consumer, academic or malformed -> null.
export const orgNameFromEmail = (email?: string | null): string | null => {
  const domain = orgDomainFromEmail(email);
  return domain ? capitalize(domain.split(".")[0]) : null;
};
