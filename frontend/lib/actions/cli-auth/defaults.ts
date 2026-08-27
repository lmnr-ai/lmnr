// Default workspace/project names for the zero-friction CLI device-approval flow:
// approving is the last step, so nothing is ever typed by the user.

export const DEFAULT_PROJECT_NAME = "dev";
export const DEFAULT_WORKSPACE_NAME = "my workspace";

// Second-level labels that belong to the public suffix, not the org
// (acme.co.uk, acme.com.au, acme.ac.jp).
const PUBLIC_SECOND_LEVEL_LABELS = new Set(["co", "com", "net", "org", "edu", "gov", "ac", "or", "ne", "gob", "govt"]);

// Consumer mail providers, matched on the org label so every ccTLD variant
// (yahoo.com, yahoo.co.uk, yahoo.fr, …) is covered by one entry.
const CONSUMER_EMAIL_PROVIDERS = new Set([
  "10minutemail",
  "126",
  "163",
  "abv",
  "aim",
  "aol",
  "att",
  "bellsouth",
  "bigpond",
  "bk",
  "charter",
  "comcast",
  "cox",
  "daum",
  "duck",
  "earthlink",
  "fastmail",
  "foxmail",
  "free",
  "freenet",
  "gmail",
  "gmx",
  "googlemail",
  "guerrillamail",
  "hanmail",
  "hey",
  "hotmail",
  "hushmail",
  "icloud",
  "inbox",
  "interia",
  "laposte",
  "libero",
  "list",
  "live",
  "mac",
  "mail",
  "mailinator",
  "me",
  "msn",
  "naver",
  "o2",
  "onet",
  "optusnet",
  "orange",
  "outlook",
  "pm",
  "proton",
  "protonmail",
  "qq",
  "rambler",
  "rediffmail",
  "rocketmail",
  "rogers",
  "sbcglobal",
  "seznam",
  "sfr",
  "shaw",
  "sina",
  "t-online",
  "telstra",
  "tempmail",
  "tiscali",
  "tuta",
  "tutanota",
  "ukr",
  "verizon",
  "virgilio",
  "wanadoo",
  "web",
  "wp",
  "yahoo",
  "yandex",
  "ymail",
  "zoho",
  "zohomail",
]);

const capitalize = (label: string): string =>
  label
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-");

// "ada@acme.com" -> "Acme", "ada@eng.acme.co.uk" -> "Acme", "ada@gmail.com" -> "my workspace".
export const workspaceNameFromEmail = (email?: string | null): string => {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 0) return DEFAULT_WORKSPACE_NAME;

  const domain = email!
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  const labels = domain.split(".").filter(Boolean);
  if (labels.length < 2) return DEFAULT_WORKSPACE_NAME;

  // Drop the TLD, then a public second-level label; whatever is last is the org.
  labels.pop();
  if (labels.length > 1 && PUBLIC_SECOND_LEVEL_LABELS.has(labels[labels.length - 1])) labels.pop();

  const org = labels[labels.length - 1];
  if (!org || CONSUMER_EMAIL_PROVIDERS.has(org)) return DEFAULT_WORKSPACE_NAME;
  return capitalize(org);
};
