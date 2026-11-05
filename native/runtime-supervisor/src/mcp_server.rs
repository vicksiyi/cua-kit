//! MCP transport through the same SDK family evidenced in the installed binary.
use crate::{
    host::{HostHandler, HostReply},
    repl_manager::ReplManager,
};
use rmcp::{model::*, service::RequestContext, ErrorData as McpError, RoleServer, ServerHandler};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct SupervisorMcp {
    session: Arc<Mutex<ReplManager>>,
    host: HostHandler,
    shutdown: tokio_util::sync::CancellationToken,
}
impl SupervisorMcp {
    pub fn new(session: ReplManager, host: HostHandler) -> Self {
        Self {
            session: Arc::new(Mutex::new(session)),
            host,
            shutdown: tokio_util::sync::CancellationToken::new(),
        }
    }
    pub async fn close(&self) -> Result<(), String> {
        self.shutdown.cancel();
        self.session.lock().await.close().await
    }
}
fn tools() -> Vec<Tool> {
    let snapshot: Value = serde_json::from_str(include_str!(
        "../../../reconstruction/node-repl-native-protocol.json"
    ))
    .expect("checked-in protocol snapshot");
    serde_json::from_value(snapshot["tools"].clone()).expect("checked-in tool schemas")
}
fn error(message: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![Content::text(message.into())])
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JsArgs {
    code: String,
    timeout_ms: Option<u64>,
    title: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ModuleArgs {
    path: String,
}
fn result_to_mcp(result: Value) -> Result<CallToolResult, String> {
    let mut content = Vec::new();
    if let Some(output) = result.get("output") {
        let output = output.as_str().ok_or("Invalid worker text output")?;
        if !output.is_empty() {
            content.push(json!({"type":"text","text":output}));
        }
    }
    if let Some(named) = result.get("named_outputs") {
        for text in named.as_array().ok_or("Invalid named output")? {
            content
                .push(json!({"type":"text","text":text.as_str().ok_or("Invalid named output")?}));
        }
    }
    if let Some(items) = result.get("content_items") {
        content.extend(
            items
                .as_array()
                .ok_or("Invalid worker content items")?
                .clone(),
        );
    }
    let failed = result["ok"] == false;
    if failed {
        content.push(json!({"type":"text","text":result["error"].as_str().unwrap_or("JavaScript execution failed")}));
    }
    let mut envelope = json!({"content":content,"isError":failed});
    if let Some(meta) = result.get("response_meta") {
        if !meta.is_object() {
            return Err("Invalid worker response metadata".into());
        }
        envelope["_meta"] = meta.clone();
    }
    serde_json::from_value(envelope).map_err(|_| "Invalid MCP content from worker".into())
}
impl ServerHandler for SupervisorMcp {
    fn get_info(&self) -> ServerInfo {
        serde_json::from_value(json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"core-runtime-supervisor","version":"0.1.0"},"instructions":"Use js for persistent JavaScript; js_reset clears bindings. Module registration requires host authorization; turn_ended is a host lifecycle operation."})).unwrap()
    }
    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(serde_json::from_value(json!({"tools":tools()})).unwrap())
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        let mut session = tokio::select! {biased;_=context.ct.cancelled()=>return Ok(error("Request cancelled before dispatch")),_=self.shutdown.cancelled()=>return Ok(error("Server is shutting down")),session=self.session.lock()=>session};
        let peer = context.peer.clone();
        let form = peer
            .peer_info()
            .and_then(|info| serde_json::to_value(info).ok())
            .is_some_and(|info| info["capabilities"]["elicitation"].get("form").is_some());
        let host = self.host.clone();
        session.set_host_handler(Arc::new(move|request|{
            let peer=peer.clone();let host=host.clone();
            Box::pin(async move{
                if request.message["type"]!="elicit"{return host(request).await;}
                if !form{return Err("MCP client does not support form elicitation".into());}
                let params=serde_json::from_value(json!({"mode":"form","message":request.message["message"],"requestedSchema":request.message["requested_schema"],"_meta":request.message["meta"]})).map_err(|_|"Invalid form elicitation request")?;
                let result=peer.create_elicitation(params).await.map_err(|error|error.to_string())?;
                let mut reply=serde_json::to_value(result).map_err(|error|error.to_string())?;reply["ok"]=json!(true);Ok(HostReply::message(reply))
            })
        }),form);
        let meta = serde_json::to_value(&context.meta)
            .map_err(|_| McpError::internal_error("Invalid request metadata", None))?;
        let operation = async {
            match request.name.as_ref() {
                "js" => {
                    if ["timeout_ms", "title"]
                        .iter()
                        .any(|key| arguments.get(*key).is_some_and(Value::is_null))
                    {
                        return Err("Invalid js arguments".into());
                    }
                    let args: JsArgs =
                        serde_json::from_value(arguments).map_err(|_| "Invalid js arguments")?;
                    let timeout = args.timeout_ms.unwrap_or(30000);
                    if timeout == 0
                        || timeout > 9007199254740991
                        || args.title.is_some_and(|title| {
                            title.is_empty() || title.encode_utf16().count() > 80
                        })
                    {
                        return Err("Invalid js arguments".into());
                    }
                    result_to_mcp(
                        session
                            .execute(&args.code, Duration::from_millis(timeout), meta, None)
                            .await?,
                    )
                }
                "js_reset" => {
                    if arguments.as_object().is_none_or(|args| !args.is_empty()) {
                        return Err("Invalid reset arguments".into());
                    }
                    session.reset().await?;
                    Ok(CallToolResult::success(vec![Content::text(
                        "JavaScript kernel reset.",
                    )]))
                }
                "js_add_node_module_dir" => {
                    let args: ModuleArgs = serde_json::from_value(arguments)
                        .map_err(|_| "Invalid module arguments")?;
                    session.add_node_module_directory(&args.path).await?;
                    Ok(CallToolResult::success(vec![Content::text(
                        "Node module directory registered.",
                    )]))
                }
                "turn_ended" => result_to_mcp(
                    session
                        .turn_ended(arguments, Duration::from_secs(30), meta, None)
                        .await?,
                ),
                _ => Err("Unknown tool".into()),
            }
        };
        let result = tokio::select! {biased;_=context.ct.cancelled()=>None,_=self.shutdown.cancelled()=>None,result=operation=>Some(result)};
        Ok(match result {
            Some(Ok(result)) => result,
            Some(Err(failure)) => error(failure),
            None => {
                let cleanup = session.reset().await;
                error(match cleanup {
                    Ok(()) => "Execution cancelled; worker state discarded".into(),
                    Err(error) => format!("Execution cancelled; retirement failed: {error}"),
                })
            }
        })
    }
}
