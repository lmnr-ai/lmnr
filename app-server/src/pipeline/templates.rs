use crate::db::pipelines::PipelineTemplateRow;
use uuid::Uuid;

pub fn insert_node_ids_to_template(template: &PipelineTemplateRow) -> PipelineTemplateRow {
    let mut runnable_graph = template.runnable_graph.clone().to_string();
    let mut displayable_graph = template.displayable_graph.clone().to_string();

    for i in 0..template.number_of_nodes.abs() {
        let node_id = Uuid::new_v4().to_string();
        let node_id_template = format!("<node_{}_id>", i);
        runnable_graph = runnable_graph.replace(&node_id_template, &node_id);
        displayable_graph = displayable_graph.replace(&node_id_template, &node_id);
    }

    let runnable_graph = serde_json::from_str(&runnable_graph).unwrap();
    let displayable_graph = serde_json::from_str(&displayable_graph).unwrap();

    PipelineTemplateRow {
        id: template.id,
        created_at: template.created_at,
        name: template.name.clone(),
        description: template.description.clone(),
        runnable_graph,
        displayable_graph,
        number_of_nodes: template.number_of_nodes,
        display_group: template.display_group.clone(),
    }
}
