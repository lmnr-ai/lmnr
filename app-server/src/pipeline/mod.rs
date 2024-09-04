use std::collections::{HashMap, HashSet};
use std::result::Result;

use lmnr_baml::BamlContext;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use self::nodes::{Node, NodeInput};
use crate::language_model::providers::utils::get_required_env_vars_for_model;

pub mod context;
pub mod nodes;
pub mod runner;
pub mod templates;
pub mod trace;
pub mod utils;

#[derive(Clone, Debug, Deserialize)]
pub struct Graph {
    pub nodes: HashMap<String, Node>,
    pub pred: HashMap<Uuid, Vec<Uuid>>,
    #[serde(skip)]
    pub env: HashMap<String, String>,
    #[serde(skip)]
    pub metadata: HashMap<String, String>,
    #[serde(skip)]
    pub run_type: RunType,
}

#[derive(thiserror::Error, Debug)]
pub enum GraphError {
    #[error("Graph input is missing: {0}")]
    InputMissing(String),
    #[error("{0}")]
    UnhandledError(#[from] anyhow::Error),
}

#[derive(Clone, Debug, PartialEq)]
pub enum RunType {
    Workshop,
    Endpoint,
    EventEvaluation,
}

impl Serialize for RunType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_string().serialize(serializer)
    }
}

impl Default for RunType {
    fn default() -> Self {
        Self::Workshop
    }
}

#[derive(Debug, Error)]
pub struct InvalidSchemasError {
    pub invalid_schemas: HashMap<String, String>,
}

impl Graph {
    pub fn setup(
        &mut self,
        inputs: &HashMap<String, NodeInput>,
        env: &HashMap<String, String>,
        metadata: &HashMap<String, String>,
        run_type: &RunType,
    ) -> Result<(), GraphError> {
        self.setup_inputs(inputs)?;
        self.env = env.clone();
        self.metadata = metadata.clone();
        self.run_type = run_type.clone();
        Ok(())
    }

    pub fn get_missing_env_vars(&self) -> HashSet<String> {
        let required_env_vars = self.get_required_env_vars();
        required_env_vars
            .into_iter()
            .filter(|var| !self.env.contains_key(var))
            .collect::<HashSet<_>>()
    }

    pub fn validate_baml_schemas(&self) -> Result<HashMap<Uuid, BamlContext>, InvalidSchemasError> {
        let mut schemas = HashMap::new();
        let mut errors = HashMap::new();
        for node in self.nodes.values() {
            if let Some(res) = self.validate_baml_schemas_for_node(node) {
                match res {
                    Ok(schema) => {
                        schemas.insert(node.id(), schema);
                    }
                    Err(e) => {
                        errors.insert(node.name(), e.to_string());
                    }
                }
            }
        }
        if errors.is_empty() {
            Ok(schemas)
        } else {
            Err(InvalidSchemasError {
                invalid_schemas: errors,
            })
        }
    }

    fn setup_inputs(&mut self, inputs: &HashMap<String, NodeInput>) -> Result<(), GraphError> {
        for node in self.nodes.values_mut() {
            match node {
                Node::Input(input_node) => {
                    if let Some(input) = inputs.get(&input_node.name) {
                        input_node.input = Some(input.clone());
                    } else {
                        return Err(GraphError::InputMissing(input_node.name.clone()));
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    pub fn get_input_node_names(&self) -> HashSet<String> {
        self.nodes
            .values()
            .filter_map(|node| match node {
                Node::Input(input_node) => Some(input_node.name.clone()),
                _ => None,
            })
            .collect()
    }

    fn get_required_env_vars(&self) -> HashSet<String> {
        let nodes = self.nodes.values().collect::<Vec<_>>();
        let mut env_vars = HashSet::new();
        for node in nodes {
            match node {
                Node::Zenguard(_zenguard_node) => {
                    env_vars.insert("ZENGUARD_API_KEY".to_string());
                }
                Node::LLM(llm_node) => {
                    if let Some(model_name) = &llm_node.model {
                        let model_env_vars = get_required_env_vars_for_model(model_name);
                        env_vars.extend(model_env_vars);
                    }
                }
                Node::Subpipeline(subpipeline_node) => {
                    // Note: Not efficient, but ok for now
                    let subgraph =
                        serde_json::from_value::<Graph>(subpipeline_node.runnable_graph.clone())
                            .unwrap();
                    env_vars.extend(subgraph.get_required_env_vars());
                }
                Node::Map(map_node) => {
                    // Note: Not efficient, but ok for now
                    let subgraph =
                        serde_json::from_value::<Graph>(map_node.runnable_graph.clone()).unwrap();
                    env_vars.extend(subgraph.get_required_env_vars());
                }
                // Listing nodes explicitly here to avoid missing a node type, when adding new nodes
                Node::Condition(_)
                | Node::Extractor(_)
                | Node::JsonExtractor(_)
                | Node::FormatValidator(_)
                | Node::Input(_)
                | Node::Output(_)
                | Node::Error(_)
                | Node::Switch(_)
                | Node::SemanticSwitch(_)
                | Node::SemanticSearch(_)
                | Node::SemanticSimilarity(_)
                | Node::StringTemplate(_) => {}
            }
        }
        env_vars
    }

    fn validate_baml_schemas_for_node(&self, node: &Node) -> Option<anyhow::Result<BamlContext>> {
        match node {
            Node::LLM(llm_node) => {
                let params = &llm_node.structured_output_params;
                if params.structured_output_enabled && params.structured_output_schema.is_some() {
                    let context = BamlContext::try_from_schema(
                        &params.structured_output_schema.as_ref().unwrap(),
                        params.structured_output_schema_target.clone(),
                    );
                    Some(context)
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

impl RunType {
    fn _should_write_traces(&self) -> bool {
        match self {
            Self::Workshop | Self::EventEvaluation | Self::Endpoint => true,
        }
    }

    fn do_local_stream(&self) -> bool {
        match self {
            Self::Workshop => true,
            Self::Endpoint | Self::EventEvaluation => false,
        }
    }

    fn to_string(&self) -> String {
        match self {
            Self::Workshop => "WORKSHOP".to_string(),
            Self::EventEvaluation => "EVENT_EVALUATION".to_string(),
            Self::Endpoint => "ENDPOINT".to_string(),
        }
    }
}
