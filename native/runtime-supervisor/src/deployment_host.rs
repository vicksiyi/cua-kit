//! Explicit standalone composition; no implicit approval or outbound HTTP authority.
use crate::{
    config_manager::ConfigManager,
    host::{HostHandler, HostReply},
    media::decode_media_message,
};
use serde_json::json;
use std::sync::Arc;
pub fn deployment_host(config: Arc<ConfigManager>) -> HostHandler {
    Arc::new(move |request| {
        let config = config.clone();
        Box::pin(async move {
            match request.message["type"].as_str() {
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
