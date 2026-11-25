//! How often a rule is checked. Derived from the window, never set by the user.

use uuid::Uuid;

use super::rule::{Condition, Rule, Window};

const MONTH_TO_DATE_INTERVAL_MINUTES: i64 = 60;

/// Minutes between two checks of a rule.
pub fn check_interval_minutes(rule: &Rule) -> i64 {
    let base = match rule.window {
        Window::MonthToDate { .. } => MONTH_TO_DATE_INTERVAL_MINUTES,
        Window::Minutes { minutes } => match minutes {
            0..30 => 1,
            30..60 => 2,
            60..240 => 3,
            240..1440 => 5,
            _ => 15,
        },
    };
    // A change rule reads two windows per check, so it runs half as often.
    match rule.condition {
        Condition::Change { .. } => base * 2,
        _ => base,
    }
}

/// Whether a rule is checked for the window ending at `minute` (unix minutes).
/// The alert id shifts each rule's grid so they do not all land on one tick.
/// The scheduler and the preview both use this grid.
pub fn is_due(alert_id: &Uuid, interval_minutes: i64, minute: i64) -> bool {
    let offset = (alert_id.as_u128() % interval_minutes as u128) as i64;
    (minute + offset).rem_euclid(interval_minutes) == 0
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn rule(window: serde_json::Value, condition: serde_json::Value) -> Rule {
        serde_json::from_value(json!({
            "metric": "total_cost",
            "window": window,
            "condition": condition,
            "warning": 1,
            "resolve": 1
        }))
        .unwrap()
    }

    #[test]
    fn follows_the_window() {
        let value = json!({ "type": "value" });
        let cases = [
            (5, 1),
            (15, 1),
            (30, 2),
            (60, 3),
            (120, 3),
            (240, 5),
            (720, 5),
            (1440, 15),
        ];
        for (minutes, expected) in cases {
            let rule = rule(json!({ "minutes": minutes }), value.clone());
            assert_eq!(check_interval_minutes(&rule), expected, "{minutes} min");
        }
        let budget = rule(
            json!({ "monthToDate": true }),
            json!({ "type": "budget", "amount": 10 }),
        );
        assert_eq!(check_interval_minutes(&budget), 60);
    }

    #[test]
    fn halves_for_change_rules() {
        let change = json!({ "type": "change", "compareTo": "1w" });
        assert_eq!(
            check_interval_minutes(&rule(json!({ "minutes": 60 }), change.clone())),
            6
        );
        assert_eq!(
            check_interval_minutes(&rule(json!({ "minutes": 5 }), change)),
            2
        );
    }

    #[test]
    fn is_due_once_per_interval() {
        let alert_id = Uuid::new_v4();
        let due = (1000..1060).filter(|m| is_due(&alert_id, 15, *m)).count();
        assert_eq!(due, 4);
    }
}
