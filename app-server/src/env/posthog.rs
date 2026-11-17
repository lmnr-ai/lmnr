//! Product analytics: API, CLI and MCP usage events (`src/posthog/`).

use super::{BoolEnv, StringEnv};

/// The frontend's `Feature.POSTHOG` switch. Only Laminar Cloud sets it, so
/// self-hosted installs never send usage events.
pub const ENABLED: BoolEnv = BoolEnv::new("POSTHOG_TELEMETRY", false);

/// The frontend's `lib/posthog/constants.ts`, so both services write to one project.
pub const KEY: StringEnv = StringEnv::new(
    "POSTHOG_KEY",
    "phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7",
);
pub const HOST: StringEnv = StringEnv::new("POSTHOG_HOST", "https://p.laminar.sh");
