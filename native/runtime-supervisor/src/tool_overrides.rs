//! Native consumption of the description-only shape emitted by CUA environment.js.
//! Validation limits/unknown-name handling are independent deployment choices.
use rmcp::model::Tool;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolOverrides {
    pub server_instructions: Option<String>,
    #[serde(default)]
    pub tools: BTreeMap<String, ToolDescription>,
}
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolDescription {
    pub description: Option<String>,
    #[serde(default)]
    pub field_descriptions: BTreeMap<String, String>,
}
impl ToolOverrides {
    pub fn apply(self, tools: Vec<Tool>) -> Result<(Vec<Tool>, Option<String>), String> {
        let mut budget = self.server_instructions.as_ref().map_or(0, String::len);
        let mut values: Vec<Value> = tools
            .into_iter()
            .map(|tool| serde_json::to_value(tool).unwrap())
            .collect();
        for (name, override_) in self.tools {
            let tool = values
                .iter_mut()
                .find(|tool| tool["name"].as_str() == Some(&name))
                .ok_or("Unknown tool description override")?;
            if let Some(description) = override_.description {
                budget = budget.saturating_add(description.len());
                tool["description"] = Value::String(description);
            }
            for (field, description) in override_.field_descriptions {
                let property = tool["inputSchema"]["properties"]
                    .get_mut(&field)
                    .and_then(Value::as_object_mut)
                    .ok_or("Unknown field description override")?;
                budget = budget.saturating_add(description.len());
                property.insert("description".into(), Value::String(description));
            }
        }
        if budget > 1024 * 1024 {
            return Err("Tool description overrides exceed 1 MiB".into());
        }
        let result = values
            .into_iter()
            .map(serde_json::from_value)
            .collect::<Result<Vec<Tool>, _>>()
            .map_err(|_| "Invalid tool description override")?;
        Ok((result, self.server_instructions))
    }
}
