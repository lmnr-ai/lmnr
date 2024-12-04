use std::sync::Arc;

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    ch::{self, events::CHEvent},
    db::{
        self,
        event_templates::{EventTemplate, EventType},
        events::{EventObservation, EventSource},
        DB,
    },
};

// TODO: Make this function more readable and separate into smaller functions
// pub async fn create_events(
//     db: Arc<DB>,
//     clickhouse: clickhouse::Client,
//     event_payloads: Vec<EventObservation>,
//     event_source: EventSource,
//     project_id: Uuid,
// ) -> Result<()> {
//     let template_names = event_payloads
//         .iter()
//         .map(|o| o.template_name.clone())
//         .collect::<Vec<String>>();
//     let event_templates_map =
//         db::event_templates::get_event_templates_map(&db.pool, &template_names, project_id).await?;

//     let mut events = vec![];
//     let mut event_templates = vec![];

//     for mut event_payload in event_payloads.into_iter() {
//         let event_template: EventTemplate =
//             match event_templates_map.get(&event_payload.template_name) {
//                 Some(et) => et.clone(),
//                 None => {
//                     let event_type = match event_payload.value {
//                         None => EventType::BOOLEAN,
//                         Some(ref value) => match value {
//                             Value::Number(_) => EventType::NUMBER,
//                             Value::String(_) => EventType::STRING,
//                             Value::Bool(_) => EventType::BOOLEAN,
//                             _ => {
//                                 log::warn!(
//                                     "Skipping event with unsupported value type: {:?}",
//                                     event_payload
//                                 );
//                                 continue;
//                             }
//                         },
//                     };
//                     // If the user wants to use events for simply logging, create a boolean event, if there's no template for such event
//                     let event_template_create_res =
//                         db::event_templates::create_event_template_idempotent(
//                             &db.pool,
//                             &event_payload.template_name,
//                             project_id,
//                             event_type,
//                         )
//                         .await;
//                     match event_template_create_res {
//                         Ok(et) => et,
//                         Err(e) => {
//                             log::warn!(
//                                 "Skipping event due to error when creating event template: {:?}",
//                                 e
//                             );
//                             continue;
//                         }
//                     }
//                 }
//             };

//         match event_template.event_type {
//             EventType::BOOLEAN => {
//                 let value = match event_payload.value.clone() {
//                     Some(v) => v,
//                     None => Value::Bool(true), // IMPORTANT: Default to true for boolean events
//                 };
//                 event_payload.value = Some(value.clone());
//                 let _bool_value = match serde_json::from_value::<bool>(value) {
//                     Ok(v) => v,
//                     Err(_) => {
//                         log::warn!(
//                             "Skipping BOOLEAN event with non-boolean value: {:?}",
//                             event_payload
//                         );
//                         continue;
//                     }
//                 };
//                 events.push(event_payload);
//                 event_templates.push(event_template);
//             }
//             EventType::STRING => {
//                 let Some(value) = event_payload.value.clone() else {
//                     log::warn!("Skipping STRING event without value: {:?}", event_payload);
//                     continue;
//                 };
//                 if serde_json::from_value::<String>(value).is_err() {
//                     log::warn!(
//                         "Skipping STRING event with non-string value: {:?}",
//                         event_payload
//                     );
//                     continue;
//                 };
//                 events.push(event_payload);
//                 event_templates.push(event_template);
//             }
//             EventType::NUMBER => {
//                 let Some(value) = event_payload.value.clone() else {
//                     log::warn!("Skipping NUMBER event without value: {:?}", event_payload);
//                     continue;
//                 };
//                 if serde_json::from_value::<f64>(value).is_err() {
//                     log::warn!(
//                         "Skipping NUMBER event with non-numeric value: {:?}",
//                         event_payload
//                     );
//                     continue;
//                 };
//                 events.push(event_payload);
//                 event_templates.push(event_template);
//             }
//         }
//     }

//     let template_ids = event_templates
//         .iter()
//         .map(|et| et.id)
//         .collect::<Vec<Uuid>>();
//     db::events::create_events_by_template_name(db, events.clone(), &template_ids, &event_source)
//         .await?;

//     let ch_events = events
//         .into_iter()
//         .zip(event_templates.into_iter())
//         .map(|(event, event_template)| {
//             CHEvent::from_data(
//                 event.id,
//                 event.timestamp,
//                 event_template,
//                 event_source.clone().into(),
//                 project_id,
//             )
//         })
//         .collect::<Vec<CHEvent>>();

//     ch::events::insert_events(clickhouse, ch_events).await
// }
