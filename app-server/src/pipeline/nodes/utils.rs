use std::collections::HashMap;

use handlebars::Handlebars;
use uuid::Uuid;

use super::{Handle, NodeInput};

/// Convert a list of input handles to a list of output handle ids and input handles
pub fn map_handles(
    inputs: &Vec<Handle>,
    inputs_mappings: &HashMap<Uuid, Uuid>,
) -> Vec<(Uuid, Handle)> {
    let mut mapping = Vec::new();

    for (to, from) in inputs_mappings.iter() {
        // safe to unwrap name here because input handles should always have names
        let to_handle_name = inputs
            .into_iter()
            .find(|handle| handle.id == *to)
            .unwrap()
            .clone();
        mapping.push((*from, to_handle_name));
    }

    mapping
}

pub fn render_template(template: &String, inputs: &HashMap<String, NodeInput>) -> String {
    let mut handlebars = Handlebars::new();
    handlebars.register_escape_fn(handlebars::no_escape);
    handlebars
        .render_template(template, inputs)
        .unwrap_or_default()
}
