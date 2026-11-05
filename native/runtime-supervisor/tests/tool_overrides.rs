use core_runtime_supervisor::tool_overrides::ToolOverrides;
use rmcp::model::Tool;
use serde_json::{json, Value};
fn tools() -> Vec<Tool> {
    let snapshot: Value = serde_json::from_str(include_str!(
        "../../../reconstruction/node-repl-native-protocol.json"
    ))
    .unwrap();
    serde_json::from_value(snapshot["tools"].clone()).unwrap()
}
#[test]
fn changes_descriptions_without_changing_tool_contracts() {
    let original = tools();
    let overrides:ToolOverrides=serde_json::from_value(json!({"server_instructions":"fixture server","tools":{"js":{"description":"fixture js","field_descriptions":{"code":"fixture code","title":""}},"js_reset":{"description":"fixture reset"}}})).unwrap();
    let (actual, instructions) = overrides.apply(original.clone()).unwrap();
    assert_eq!(instructions.as_deref(), Some("fixture server"));
    let mut expected = serde_json::to_value(original).unwrap();
    for tool in expected.as_array_mut().unwrap() {
        if tool["name"] == "js" {
            tool["description"] = json!("fixture js");
            tool["inputSchema"]["properties"]["code"]["description"] = json!("fixture code");
            tool["inputSchema"]["properties"]["title"]["description"] = json!("");
        }
        if tool["name"] == "js_reset" {
            tool["description"] = json!("fixture reset");
        }
    }
    assert_eq!(serde_json::to_value(actual).unwrap(), expected);
}
#[test]
fn rejects_unrecognized_schema_edits_and_bounded_text_overflow() {
    for value in [
        json!({"tools":{"unknown":{"description":"x"}}}),
        json!({"tools":{"js":{"field_descriptions":{"unknown":"x"}}}}),
        json!({"server_instructions":"x".repeat(1024*1024+1)}),
    ] {
        let overrides: ToolOverrides = serde_json::from_value(value).unwrap();
        assert!(overrides.apply(tools()).is_err());
    }
    assert!(serde_json::from_value::<ToolOverrides>(
        json!({"tools":{"js":{"inputSchema":{"additionalProperties":true}}}})
    )
    .is_err());
    let (actual, instructions) = ToolOverrides::default().apply(tools()).unwrap();
    assert_eq!(
        serde_json::to_value(actual).unwrap(),
        serde_json::to_value(tools()).unwrap()
    );
    assert_eq!(instructions, None);
}
