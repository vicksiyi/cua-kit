//! Explicit standalone composition; fetch capability is supplied by the trusted host.
use crate::{
    config_manager::ConfigManager,
    host::{HostHandler, HostReply},
    media::decode_media_message,
};
use serde_json::json;
use std::sync::Arc;
pub fn deployment_host(config: Arc<ConfigManager>) -> HostHandler {
    deployment_host_with_fetch(config, None)
}

/// Compose a configured native fetch service into the existing worker callback.
/// Execution identity/lifetime checks remain in BackgroundHost/ReplManager.
pub fn deployment_host_with_fetch(
    config: Arc<ConfigManager>,
    fetch: Option<Arc<crate::authenticated_fetch::AuthenticatedFetchService>>,
) -> HostHandler {
    Arc::new(move |request| {
        let config = config.clone();
        let fetch = fetch.clone();
        Box::pin(async move {
            match request.message["type"].as_str() {
                Some("authenticated_fetch") => {
                    let service = fetch.ok_or("Authenticated fetch host is not configured")?;
                    let payload: crate::authenticated_fetch::AuthenticatedFetchRequest =
                        serde_json::from_value(request.message["request"].clone()).map_err(
                            |error| format!("Invalid authenticated fetch request: {error}"),
                        )?;
                    let response = service.fetch(&payload).await?;
                    Ok(HostReply::message(json!({"ok":true,"response":response})))
                }
                Some("config_action") => config
                    .request(&request.message)
                    .await
                    .map(HostReply::message),
                Some("emit_image" | "emit_audio") => Ok(HostReply {
                    message: json!({"ok":true}),
                    content: vec![decode_media_message(&request.message)?],
                }),
                _ => Err("Host operation is not configured in this deployment".into()),
            }
        })
    })
}
