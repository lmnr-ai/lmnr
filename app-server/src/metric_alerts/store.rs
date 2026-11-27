//! Moves engine state in and out of Postgres.

use std::collections::HashMap;

use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::metric_alerts::{
    self, IncidentUpdate, MetricAlertIncidentRow, MetricAlertStateRow, NewIncident,
};

use super::engine::{Incident, Level, State};

/// Identifies the state of one rule version for one group.
pub struct StateKey<'a> {
    pub project_id: Uuid,
    pub alert_id: Uuid,
    pub group_key: &'a str,
    pub fingerprint: &'a str,
}

fn to_incident(row: &MetricAlertIncidentRow) -> Incident {
    Incident {
        id: Some(row.id),
        level: Level::parse(&row.level),
        peak_level: Level::parse(&row.peak_level),
        peak_value: row.peak_value,
        opened_at: row.opened_at,
        escalated_at: row.escalated_at,
        reopened_at: row.reopened_at,
        resolved_at: row.resolved_at,
        last_notified_at: row.last_notified_at,
    }
}

pub fn to_state(row: &MetricAlertStateRow, incident: Option<&MetricAlertIncidentRow>) -> State {
    State {
        level: Level::parse(&row.level),
        streak_level: Level::parse(&row.streak_level),
        streak_count: row.streak_count.max(0) as u32,
        last_processed_at: row.last_processed_at,
        last_value: row.last_value,
        incident: incident.map(to_incident),
    }
}

pub fn to_state_row(key: &StateKey<'_>, state: &State) -> MetricAlertStateRow {
    MetricAlertStateRow {
        alert_id: key.alert_id,
        group_key: key.group_key.to_string(),
        project_id: key.project_id,
        level: state.level.as_str().to_string(),
        streak_level: state.streak_level.as_str().to_string(),
        streak_count: state.streak_count as i32,
        last_processed_at: state.last_processed_at,
        last_value: state.last_value,
        current_incident_id: state.incident.as_ref().and_then(|incident| incident.id),
        rule_fingerprint: key.fingerprint.to_string(),
    }
}

/// Loads the state of every group of a rule. State computed for an earlier
/// version of the rule is discarded and its open incidents are closed, so an
/// edited rule starts over.
pub async fn load_states(
    pool: &PgPool,
    project_id: &Uuid,
    alert_id: &Uuid,
    fingerprint: &str,
) -> anyhow::Result<HashMap<String, State>> {
    let rows = metric_alerts::get_states(pool, project_id, alert_id).await?;
    if rows.iter().any(|row| row.rule_fingerprint != fingerprint) {
        let mut tx = pool.begin().await?;
        metric_alerts::delete_states(&mut tx, project_id, alert_id).await?;
        metric_alerts::resolve_open_incidents(&mut tx, project_id, alert_id, Utc::now()).await?;
        tx.commit().await?;
        return Ok(HashMap::new());
    }

    let incident_ids: Vec<Uuid> = rows.iter().filter_map(|r| r.current_incident_id).collect();
    let incidents: HashMap<Uuid, MetricAlertIncidentRow> =
        metric_alerts::get_incidents_by_ids(pool, project_id, &incident_ids)
            .await?
            .into_iter()
            .map(|incident| (incident.id, incident))
            .collect();

    let states = rows
        .iter()
        .map(|row| {
            let incident = row.current_incident_id.and_then(|id| incidents.get(&id));
            (row.group_key.clone(), to_state(row, incident))
        })
        .collect();

    Ok(states)
}

/// Stores the state after a check, together with its incident. Returns false
/// and writes nothing when another replica already stored this check.
pub async fn save(
    pool: &PgPool,
    key: &StateKey<'_>,
    before: &State,
    state: &mut State,
) -> anyhow::Result<bool> {
    let mut tx = pool.begin().await?;

    let incident_changed = before.incident != state.incident;
    if let (true, Some(incident)) = (incident_changed, state.incident.as_mut()) {
        let id = match incident.id {
            Some(id) => id,
            None => {
                let new_incident = NewIncident {
                    project_id: key.project_id,
                    alert_id: key.alert_id,
                    group_key: key.group_key,
                    level: incident.level.as_str(),
                    value: incident.peak_value,
                    opened_at: incident.opened_at,
                };
                metric_alerts::insert_incident(&mut tx, &new_incident).await?
            }
        };
        let update = IncidentUpdate {
            level: incident.level.as_str(),
            peak_level: incident.peak_level.as_str(),
            peak_value: incident.peak_value,
            escalated_at: incident.escalated_at,
            reopened_at: incident.reopened_at,
            resolved_at: incident.resolved_at,
            last_notified_at: incident.last_notified_at,
        };
        metric_alerts::update_incident(&mut tx, &key.project_id, &id, &update).await?;
        incident.id = Some(id);
    }

    // Dropping the transaction rolls the incident back with it.
    if !metric_alerts::upsert_state(&mut tx, &to_state_row(key, state)).await? {
        return Ok(false);
    }
    tx.commit().await?;

    Ok(true)
}
