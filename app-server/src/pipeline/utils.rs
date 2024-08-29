use anyhow::Result;
use std::{collections::HashMap, env, sync::Arc};
use uuid::Uuid;

use crate::engine::Task;

use super::{nodes::Node, Graph};

pub fn parse_graph(graph: Graph) -> Result<HashMap<Uuid, Task>> {
    validate_graph(&graph)?;

    let mut tasks: HashMap<Uuid, Task> = graph
        .nodes
        .into_iter()
        .map(|(_, node)| (node.id(), task_from_node(node)))
        .collect();

    for (to, from) in graph.pred {
        for from_node in from {
            tasks.get_mut(&to).unwrap().add_prev(from_node);
            tasks.get_mut(&from_node).unwrap().add_next(to);
        }
    }

    Ok(tasks)
}

fn validate_graph(graph: &Graph) -> Result<()> {
    if !graph
        .nodes
        .to_owned()
        .into_iter()
        .any(|(_node_name, node)| matches!(node, Node::Output(_)) || matches!(node, Node::Error(_)))
    {
        return Err(anyhow::anyhow!(
            "Graph must contain at least one output node"
        ));
    };
    Ok(())
}

fn task_from_node(node: Node) -> Task {
    match node {
        Node::Input(input_node) => Task::with_action(input_node.id.clone(), Arc::new(input_node)),
        Node::Output(output_node) => {
            Task::with_action(output_node.id.clone(), Arc::new(output_node))
        }
        Node::Error(error_node) => Task::with_action(error_node.id.clone(), Arc::new(error_node)),
        Node::LLM(llm_node) => Task::with_action(llm_node.id.clone(), Arc::new(llm_node)),
        Node::Condition(condition_node) => {
            Task::with_action(condition_node.id.clone(), Arc::new(condition_node))
        }
        Node::Extractor(extractor_node) => {
            Task::with_action(extractor_node.id.clone(), Arc::new(extractor_node))
        }
        Node::JsonExtractor(json_extractor_node) => Task::with_action(
            json_extractor_node.id.clone(),
            Arc::new(json_extractor_node),
        ),
        Node::Switch(router_node) => {
            Task::with_action(router_node.id.clone(), Arc::new(router_node))
        }
        Node::SemanticSearch(semantic_search_node) => Task::with_action(
            semantic_search_node.id.clone(),
            Arc::new(semantic_search_node),
        ),
        Node::SemanticSwitch(semantic_router_node) => Task::with_action(
            semantic_router_node.id.clone(),
            Arc::new(semantic_router_node),
        ),
        Node::StringTemplate(string_template_node) => Task::with_action(
            string_template_node.id.clone(),
            Arc::new(string_template_node),
        ),
        Node::Subpipeline(subpipeline_node) => {
            Task::with_action(subpipeline_node.id.clone(), Arc::new(subpipeline_node))
        }
        Node::Map(map_node) => Task::with_action(map_node.id.clone(), Arc::new(map_node)),
        Node::Zenguard(zenguard_node) => {
            Task::with_action(zenguard_node.id.clone(), Arc::new(zenguard_node))
        }
        Node::FormatValidator(format_validator_node) => Task::with_action(
            format_validator_node.id.clone(),
            Arc::new(format_validator_node),
        ),
        Node::SemanticSimilarity(semantic_similarity_node) => Task::with_action(
            semantic_similarity_node.id.clone(),
            Arc::new(semantic_similarity_node),
        ),
    }
}

// fn top_sort_util(
//     node_id: &str,
//     visited: &mut HashMap<String, bool>,
//     stack: &mut Vec<String>,
//     graph: &Graph,
// ) {
//     visited.insert(node_id.to_string(), true);

//     if !graph.pred.contains_key(node_id) {
//         stack.push(node_id.to_string());
//         return;
//     }

//     for pred in graph.pred.get(node_id).unwrap() {
//         if !visited.get(pred).unwrap() {
//             top_sort_util(pred, visited, stack, graph);
//         }
//     }

//     stack.push(node_id.to_string());
// }

// fn top_sort(graph: &Graph) -> Vec<String> {
//     let mut visited: HashMap<String, bool> = graph
//         .nodes
//         .iter()
//         .map(|(node_id, _)| (node_id.clone(), false))
//         .collect();

//     let mut stack: Vec<String> = Vec::new();

//     for (node_id, _) in graph.nodes.iter() {
//         if !visited.get(node_id).unwrap() {
//             top_sort_util(node_id, &mut visited, &mut stack, graph);
//         }
//     }

//     assert!(visited.len() == graph.nodes.len());
//     stack
// }

/// Quick hack: Iterate over graph's nodes and based on that return the updated environment.
pub fn to_env_with_provided_env_vars(
    env: &HashMap<String, String>,
    graph: &Graph,
) -> HashMap<String, String> {
    let mut env = env.clone();

    if env.contains_key("OPENAI_API_KEY") {
        return env;
    }

    let mut add_provided_openai_api_key = false;
    for node in graph.nodes.values() {
        if let Node::LLM(llm_node) = node {
            if let Some(model_name) = &llm_node.model {
                if model_name.starts_with("openai:") {
                    if model_name.starts_with("openai:gpt-3.5")
                        || model_name == "openai:gpt-4o-mini"
                    {
                        add_provided_openai_api_key = true;
                    } else {
                        add_provided_openai_api_key = false;
                        break;
                    }
                }
            }
        }
    }

    if add_provided_openai_api_key {
        let openai_api_key = env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");
        env.insert(String::from("OPENAI_API_KEY"), openai_api_key);
    }

    env
}

pub fn get_pipeline_version_cache_key(project_id: &str, pipeline_name: &str) -> String {
    format!("{}:{}", project_id, pipeline_name)
}
