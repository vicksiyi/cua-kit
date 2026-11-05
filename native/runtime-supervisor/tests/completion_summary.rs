use core_runtime_supervisor::completion_summary::{CompletionSummary,validate};
use rmcp::model::Tool;
use serde_json::{json,Value};
#[test]
fn matches_observed_installed_schema_and_argument_cases() {
 let snapshot:Value=serde_json::from_str(include_str!("../../../reconstruction/node-repl-completion-protocol.json")).unwrap();
 let records=&snapshot["records"];
 let mut tools:Vec<Tool>=serde_json::from_value(records[0]["tools"]["result"]["tools"].clone()).unwrap();
 let config:CompletionSummary=serde_json::from_value(json!({"instructions":"Report the completed task.","description":"Short completed task headline."})).unwrap();
 config.apply(&mut tools).unwrap();
 assert_eq!(serde_json::to_value(tools).unwrap(),records[1]["tools"]["result"]["tools"]);
 for case in records[1]["cases"].as_array().unwrap() {
  if case["arguments"].get("completion_summary").is_none(){continue;}
  match validate(&case["arguments"]) {
   Ok(())=>assert!(case["response"].get("result").is_some()),
   Err(error)=>{
    assert_eq!(serde_json::to_value(error).unwrap(),case["response"]["error"]);
   }
  }
 }
}
