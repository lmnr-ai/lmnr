use anyhow::Result;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    engine::Task,
    language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart},
};

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
        Node::Code(code_node) => Task::with_action(code_node.id.clone(), Arc::new(code_node)),
    }
}

pub fn get_target_pipeline_version_cache_key(project_id: &str, pipeline_name: &str) -> String {
    format!("{}:{}", project_id, pipeline_name)
}

pub fn render_chat_message_list(messages: Vec<ChatMessage>) -> String {
    messages
        .iter()
        .map(|message| match message.content {
            ChatMessageContent::Text(ref text) => {
                format!("<{}>\n{}\n</{}>", message.role, text, message.role)
            }
            ChatMessageContent::ContentPartList(ref parts) => {
                let text_message = parts
                    .iter()
                    .map(|part| match part {
                        ChatMessageContentPart::Text(ref text) => text.text.clone(), // TODO: Do it more efficiently than clone
                        _ => String::new(),
                    })
                    .collect::<Vec<String>>()
                    .join("");
                format!("<{}>\n{}\n</{}>", message.role, text_message, message.role)
            }
        })
        .collect::<Vec<String>>()
        .join("\n\n")
}
