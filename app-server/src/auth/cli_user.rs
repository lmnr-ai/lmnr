//! CLI user-token auth: verifies a BetterAuth EdDSA access JWT against the
//! frontend's JWKS, authorizes the user against the target project's workspace
//! membership, and inserts a `ProjectContext` for the `/v1/cli/*` surface.
//!
//! Filled in across phases 2-4.
