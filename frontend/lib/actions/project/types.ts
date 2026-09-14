// Client-safe: `settings.ts` pulls in the db and Redis clients, so client
// components import the setting vocabulary from here.

/// `off`: store as received. `redact`: the redactor's output replaces the raw
/// text. `dual`: keep raw text plus PII masks; the read path masks per role.
/// Mirror of the Rust `PiiMode`.
export const PII_MODES = ["off", "redact", "dual"] as const;
export type PiiMode = (typeof PII_MODES)[number];
