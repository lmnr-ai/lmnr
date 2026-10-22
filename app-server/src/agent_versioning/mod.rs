//! Agent versioning v3: an agent's version is the set of system prompt and
//! tool lines present in every one of its traces, and it changes only when
//! a line flips (see [`detector`]).
//!
//! Independent of `traces::sp_versioning`: it reuses only system message
//! extraction, the agent hash and tool normalization.
//!
//! Not wired into ingestion yet; the detector is exercised by unit tests, a
//! synthetic stream with known deploys and a read-only staging replay.

// Nothing calls into the module until it is wired into a job.
#![allow(dead_code)]

pub mod detector;
pub mod document;

#[cfg(test)]
mod replay;
#[cfg(test)]
mod simulation;
