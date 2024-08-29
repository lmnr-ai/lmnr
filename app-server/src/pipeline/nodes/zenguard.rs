use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tonic::async_trait;
use uuid::Uuid;

use super::{utils::map_handles, ConditionedValue, Handle, NodeInput};
use crate::pipeline::{context::Context, trace::MetaLog};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Detector {
    #[serde(rename = "type")]
    detector_type: String,
    enabled: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZenguardNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    detectors: Vec<Detector>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZenguardNodeMetaLog {
    /// Map from detector type to its response. Response has "input" and "response" keys.
    pub responses: HashMap<String, HashMap<String, Value>>,
    /// Order in which detectors have been applied
    pub detectors_order: Vec<String>,
}

/// list for "keywords" detector, dict for "pii" detector
#[derive(Deserialize)]
#[serde(untagged)]
enum DetectorValue {
    List(Vec<String>),
    Dict(HashMap<String, Vec<String>>),
}

#[derive(Deserialize)]
struct ZenguardResponse {
    is_detected: bool,
    // score: Option<f32>,
    sanitized_message: Option<String>,
    block: Option<DetectorValue>,
    // warning: Option<DetectorValue>,
    // redact: Option<DetectorValue>,
}

struct DetectorResponse {
    block: bool,
    redacted_input: Option<String>,
    zenguard_response: Value,
}

impl ZenguardNode {
    async fn call_detector(
        &self,
        client: &Client,
        detector_type: &str,
        input: &str,
        api_key: &str,
    ) -> Result<DetectorResponse> {
        let url = format!("https://api.zenguard.ai/v1/detect/{}", detector_type);
        let response = client
            .post(url)
            .header("accept", "application/json")
            .header("content-type", "application/json")
            .header("x-api-key", api_key)
            .json(&serde_json::json!({
                "messages": vec![input],
            }))
            .send()
            .await
            .unwrap();

        if response.status() != 200 {
            return Err(anyhow::anyhow!(
                "Failed to call detector: status {}, res: {}",
                response.status(),
                &response.text().await.unwrap()
            ));
        }

        let zenguard_response_json: Value = response.json().await?;
        let zenguard_response: ZenguardResponse =
            serde_json::from_value(zenguard_response_json.clone())?;
        let (block, redacted_input) = match detector_type {
            "prompt_injection" => match zenguard_response.is_detected {
                true => (true, None),
                false => (false, Some(input.to_owned())),
            },
            "pii" => match zenguard_response.block {
                Some(DetectorValue::Dict(block_dict)) => {
                    if block_dict.is_empty() {
                        (false, Some(zenguard_response.sanitized_message.unwrap()))
                    } else {
                        (true, None)
                    }
                }
                _ => {
                    return Err(anyhow::anyhow!(
                        "Unexpected response from Zenguard: {}",
                        &zenguard_response_json
                    ))
                }
            },
            "topics/allowed" => match zenguard_response.is_detected {
                true => (false, Some(input.to_owned())),
                false => (true, None),
            },
            "topics/banned" => match zenguard_response.is_detected {
                true => (true, None),
                false => (false, Some(input.to_owned())),
            },
            "keywords" => match zenguard_response.block {
                Some(DetectorValue::List(block_list)) => {
                    if block_list.is_empty() {
                        (false, Some(zenguard_response.sanitized_message.unwrap()))
                    } else {
                        (true, None)
                    }
                }
                _ => {
                    return Err(anyhow::anyhow!(
                        "Unexpected response from Zenguard: {}",
                        &zenguard_response_json
                    ))
                }
            },
            "secrets" => (false, Some(zenguard_response.sanitized_message.unwrap())),
            _ => {
                return Err(anyhow::anyhow!("Unknown detector: {}", detector_type));
            }
        };

        return Ok(DetectorResponse {
            block,
            redacted_input,
            zenguard_response: zenguard_response_json,
        });
    }
}

#[async_trait]
impl RunnableNode for ZenguardNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        map_handles(&self.inputs, &self.inputs_mappings)
    }

    fn output_handle_id(&self) -> Uuid {
        self.outputs.first().unwrap().id
    }

    fn node_name(&self) -> String {
        self.name.to_owned()
    }

    fn node_id(&self) -> Uuid {
        self.id
    }

    fn node_type(&self) -> String {
        "Zenguard".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input: String = inputs.values().next().unwrap().clone().try_into()?;

        let api_key = context.env.get("ZENGUARD_API_KEY").unwrap();

        // "redact" is Zenguard's term for modifying input and substituting some data in it
        let mut redacted_input = input.clone();
        let mut condition = String::from("passthrough");

        // TODO: Implement a pool of reqwest clients or make shared client
        let client = Client::new();
        let mut responses: HashMap<String, HashMap<String, Value>> = HashMap::new();

        // It's inevitable to call one-by-one sequentially, because message possibly will get
        // redacted on every call.
        for detector in &self.detectors {
            if !detector.enabled {
                continue;
            }

            let detector_response = self
                .call_detector(&client, &detector.detector_type, &redacted_input, api_key)
                .await;
            match detector_response {
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "Error when calling Zenguard detector {}: {}",
                        &detector.detector_type,
                        e,
                    ));
                }
                Ok(response) => {
                    let mut response_map = HashMap::new();
                    response_map.insert("input".to_owned(), Value::String(redacted_input.clone()));
                    response_map.insert("response".to_owned(), response.zenguard_response);
                    responses.insert(detector.detector_type.clone(), response_map);

                    if response.block {
                        condition = String::from("block");
                        // All other detectors are ignored, if at least one requires to block the message
                        break;
                    } else {
                        redacted_input = response
                            .redacted_input
                            .expect("Redacted input must be set if not blocked");
                    };
                }
            };
        }

        let value = if condition == "block" {
            input
        } else {
            redacted_input
        };
        let condition_value = ConditionedValue {
            value: Box::new(NodeInput::String(value)),
            condition,
        };

        let detectors_order = self
            .detectors
            .iter()
            .filter(|detector| detector.enabled)
            .map(|detector| detector.detector_type.to_owned())
            .collect();

        let meta_log = ZenguardNodeMetaLog {
            responses,
            detectors_order,
        };

        Ok(RunOutput::Success((
            condition_value.into(),
            Some(MetaLog::Zenguard(meta_log)),
        )))
    }
}
