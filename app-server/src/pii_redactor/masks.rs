//! PII masks: byte ranges into a canonical text, and the splice that renders
//! them.

use anyhow::{Result, anyhow};

use super::pii_redactor;

/// Prefix of the placeholder spliced over a mask: `[REDACTED_<LABEL>]`.
pub const PII_PLACEHOLDER_PREFIX: &str = "[REDACTED_";

/// One PII entity: `start..end` are byte offsets into the owning
/// [`MaskedText::text`] (UTF-8 char boundaries), `label` the model's base
/// label (`private_email`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PiiMask {
    pub start: u32,
    pub end: u32,
    pub label: String,
}

/// The redactor's canonical compact re-serialization of one stringified-JSON
/// text plus the PII ranges into it; the masks index this exact string.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MaskedText {
    pub text: String,
    /// Sorted, non-overlapping.
    pub masks: Vec<PiiMask>,
}

impl MaskedText {
    /// `text` with `[REDACTED_<LABEL>]` spliced over every mask.
    pub fn redacted(&self) -> Result<String> {
        apply_masks(&self.text, &self.masks)
    }
}

impl From<pii_redactor::RedactedText> for MaskedText {
    fn from(r: pii_redactor::RedactedText) -> Self {
        Self {
            text: r.text,
            masks: r
                .masks
                .into_iter()
                .map(|m| PiiMask {
                    start: m.start,
                    end: m.end,
                    label: m.label,
                })
                .collect(),
        }
    }
}

/// Masks must be sorted, non-overlapping, within `text`, and on char
/// boundaries. The redactor guarantees this (`normalize_ranges` resolves
/// model overlaps before serializing), so a violation is a contract bug and
/// fails the whole text rather than a best-effort splice.
fn validate_masks(text: &str, masks: &[PiiMask]) -> Result<()> {
    let mut cursor = 0usize;
    for m in masks {
        let (start, end) = (m.start as usize, m.end as usize);
        if start < cursor
            || end < start
            || end > text.len()
            || !text.is_char_boundary(start)
            || !text.is_char_boundary(end)
        {
            return Err(anyhow!(
                "malformed pii mask {start}..{end} (cursor {cursor}, len {})",
                text.len()
            ));
        }
        cursor = end;
    }
    Ok(())
}

/// Splice `[REDACTED_<LABEL>]` over every mask. A malformed mask is an error
/// instead of partially redacted text: callers treat it like an RPC failure.
fn apply_masks(text: &str, masks: &[PiiMask]) -> Result<String> {
    validate_masks(text, masks)?;
    let mut out = String::with_capacity(text.len());
    let mut cursor = 0usize;
    for m in masks {
        let (start, end) = (m.start as usize, m.end as usize);
        out.push_str(&text[cursor..start]);
        out.push_str(PII_PLACEHOLDER_PREFIX);
        out.push_str(&m.label.to_uppercase());
        out.push(']');
        cursor = end;
    }
    out.push_str(&text[cursor..]);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mask(start: u32, end: u32, label: &str) -> PiiMask {
        PiiMask {
            start,
            end,
            label: label.to_string(),
        }
    }

    #[test]
    fn splices_placeholders_in_byte_order() {
        let text = r#"{"email":"alice@example.com","name":"Zoë Bäcker"}"#;
        let masks = [
            mask(10, 27, "private_email"),
            mask(37, 49, "private_person"),
        ];
        assert_eq!(
            apply_masks(text, &masks).unwrap(),
            r#"{"email":"[REDACTED_PRIVATE_EMAIL]","name":"[REDACTED_PRIVATE_PERSON]"}"#
        );
    }

    #[test]
    fn no_masks_returns_the_text_unchanged() {
        assert_eq!(apply_masks(r#"{"a":1}"#, &[]).unwrap(), r#"{"a":1}"#);
    }

    #[test]
    fn masks_at_both_ends() {
        assert_eq!(
            apply_masks("abcdef", &[mask(0, 2, "x"), mask(4, 6, "y")]).unwrap(),
            "[REDACTED_X]cd[REDACTED_Y]"
        );
    }

    #[test]
    fn malformed_masks_are_errors_not_partial_output() {
        assert!(apply_masks("abc", &[mask(0, 4, "x")]).is_err());
        assert!(apply_masks("abc", &[mask(2, 1, "x")]).is_err());
        assert!(apply_masks("abc", &[mask(1, 2, "x"), mask(0, 1, "y")]).is_err());
        assert!(apply_masks("Zoë", &[mask(0, 3, "x")]).is_err());
    }

    #[test]
    fn masked_text_redacted() {
        let clean = MaskedText {
            text: "\"x\"".into(),
            masks: vec![],
        };
        assert_eq!(clean.redacted().unwrap(), "\"x\"");

        let hit = MaskedText {
            text: "\"secret\"".into(),
            masks: vec![mask(1, 7, "secret")],
        };
        assert_eq!(hit.redacted().unwrap(), "\"[REDACTED_SECRET]\"");
    }
}
