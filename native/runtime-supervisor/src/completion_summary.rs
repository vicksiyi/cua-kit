//! Observed native MCP completion branch; see node-repl-completion-protocol.json.
//! This reports a task outcome, not a worker execution or turn_ended notification.
use rmcp::{model::Tool, ErrorData};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompletionSummary {
    pub instructions: String,
    pub description: String,
}
impl CompletionSummary {
    pub fn apply(self, tools: &mut [Tool]) -> Result<(), String> {
        let tool = tools.iter_mut().find(|tool| tool.name == "js").ok_or("Missing js tool")?;
        let mut value = serde_json::to_value(&*tool).map_err(|e|e.to_string())?;
        let code_schema = value["inputSchema"].clone();
        let property = json!({"type":"string","minLength":1,"maxLength":80,"description":self.description});
        let summary_schema = json!({"type":"object","additionalProperties":false,"properties":{"completion_summary":property},"required":["completion_summary"]});
        value["inputSchema"].as_object_mut().unwrap().remove("required");
        value["inputSchema"]["properties"]["completion_summary"] = property;
        value["inputSchema"]["oneOf"] = json!([code_schema,summary_schema]);
        value["description"] = json!(format!("{}\n\n{}",value["description"].as_str().unwrap_or(""),self.instructions));
        *tool = serde_json::from_value(value).map_err(|e|e.to_string())?;
        Ok(())
    }
}

pub fn validate(arguments: &Value) -> Result<(), ErrorData> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Args { completion_summary: String }
    let args: Args = serde_json::from_value(arguments.clone())
        .map_err(|error| ErrorData::invalid_params(format!("js: {error}"), None))?;
    if args.completion_summary.trim().is_empty() || args.completion_summary.chars().count() > 80 {
        return Err(ErrorData::invalid_params("js: completion_summary must be non-blank and at most 80 characters",None));
    }
    Ok(())
}
