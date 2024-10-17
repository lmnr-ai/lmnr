use std::collections::{HashMap, HashSet};
use std::result::Result;

use lmnr_baml::BamlContext;
use nodes::input::InputNode;
use nodes::output::OutputNode;
use nodes::Handle;
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

#[derive(Clone, Debug, Deserialize, Serialize)]
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
    AutoLabel,
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
    pub fn try_from_node(node: &mut Node) -> anyhow::Result<Self> {
        if &node.node_type() == "Input" || &node.node_type() == "Output" {
            return Err(anyhow::anyhow!(
                "Input and Output nodes are not allowed in a singleton graph"
            ));
        }
        let mut nodes = HashMap::new();
        let mut pred = HashMap::new();
        let (inputs, outputs, inputs_mappings) = match node {
            Node::LLM(llm_node) => (
                llm_node.inputs.clone(),
                llm_node.outputs.clone(),
                &mut llm_node.inputs_mappings,
            ),
            Node::Code(code_node) => (
                code_node.inputs.clone(),
                code_node.outputs.clone(),
                &mut code_node.inputs_mappings,
            ),
            _ => {
                return Err(anyhow::anyhow!(
                    "Only LLM and Code nodes are supported in a singleton graph"
                ))
            }
        };
        let mut input_ids = Vec::new();
        inputs.iter().for_each(|handle| {
            let input_node_output_handle = Handle {
                id: Uuid::new_v4(),
                name: Some(handle.name.clone().unwrap()),
                handle_type: handle.handle_type.clone(),
                is_cyclic: false,
            };
            let input_node = Node::Input(InputNode {
                id: Uuid::new_v4(),
                name: handle.name.clone().unwrap(),
                input: None,
                input_type: handle.handle_type.clone(),
                outputs: vec![input_node_output_handle.clone()],
            });
            input_ids.push(input_node.id());
            nodes.insert(input_node.name().clone(), input_node);
            inputs_mappings.insert(handle.id, input_node_output_handle.id);
        });
        pred.insert(node.id(), input_ids);
        nodes.insert(node.name(), node.clone());

        outputs.iter().for_each(|handle| {
            let output_node_input_handle = Handle {
                id: Uuid::new_v4(),
                name: Some(handle.name.clone().unwrap()),
                handle_type: handle.handle_type.clone(),
                is_cyclic: false,
            };
            let output_node = Node::Output(OutputNode {
                id: Uuid::new_v4(),
                name: handle.name.clone().unwrap(),
                inputs: vec![output_node_input_handle.clone()],
                inputs_mappings: HashMap::from([(output_node_input_handle.id, handle.id)]),
                output_cast_type: None,
            });
            pred.insert(output_node.id(), vec![node.id()]);
            nodes.insert(output_node.name().clone(), output_node);
        });

        Ok(Self {
            nodes,
            pred,
            env: HashMap::new(),
            metadata: HashMap::new(),
            run_type: RunType::AutoLabel,
        })
    }

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
                | Node::StringTemplate(_)
                | Node::Code(_) => {}
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
    fn do_local_stream(&self) -> bool {
        match self {
            Self::Workshop => true,
            Self::Endpoint | Self::AutoLabel => false,
        }
    }

    fn to_string(&self) -> String {
        match self {
            Self::Workshop => "WORKSHOP".to_string(),
            Self::AutoLabel => "AUTOLABEL".to_string(),
            Self::Endpoint => "ENDPOINT".to_string(),
        }
    }
}
