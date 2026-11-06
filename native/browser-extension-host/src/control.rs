//! Native extension-input control, separate from ordinary browser RPC forwarding.
//! App-server lifecycle and attachment methods share native control ownership.
use crate::tab_context_asset::AssetStore;
use serde_json::{json, Value};
use std::{
    fs, io,
    os::unix::fs::{DirBuilderExt, MetadataExt},
    path::PathBuf,
};

pub struct NativeControl {
    proxy: Option<crate::app_server_proxy::AppServerProxy>,
    directory: PathBuf,
    assets: Option<AssetStore>,
    directory_identity: Option<(u64, u64)>,
}
impl NativeControl {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            proxy: None,
            directory,
            assets: None,
            directory_identity: None,
        }
    }
    pub fn handle(&mut self, message: &Value) -> Option<Value> {
        let executable = match message.get("method").and_then(Value::as_str) {
            Some("codexRuntime/ensure" | "codexRuntime/restart") => std::env::current_exe().ok(),
            _ => None,
        };
        self.handle_with_environment(message, executable.as_deref(), |key| std::env::var_os(key))
    }

    /// Same dispatcher with explicit process context for isolated integration tests.
    pub fn handle_with_environment(
        &mut self,
        message: &Value,
        executable: Option<&std::path::Path>,
        environment: impl FnMut(&str) -> Option<std::ffi::OsString>,
    ) -> Option<Value> {
        let method = message.get("method")?.as_str()?;
        let id = message.get("id").cloned().unwrap_or(Value::Null);
        if method == "codexRuntime/hello" {
            // Pinned native host 0x100025970..0x100025c68: static capabilities,
            // independent of installed registry, proxy state and request params.
            return Some(json!({"jsonrpc":"2.0","id":id,"result":{
                "manifestSchemaVersion":2,
                "nativeHostProtocolVersion":2,
                "nativeHostVersion":"0.1.0",
                "supportedMethods":["codexRuntime/openLocalFile"],
                "supportedProtocolVersions":[2]
            }}));
        }
        if method == "codexRuntime/status" {
            return Some(json!({"jsonrpc":"2.0","id":id,
                "result":crate::app_server_status::from_proxy(self.proxy.as_ref())}));
        }
        if matches!(method, "codexRuntime/ensure" | "codexRuntime/restart") {
            let result = crate::app_server_request::ensure_with_environment(
                &mut self.proxy,
                message.get("params"),
                method == "codexRuntime/restart",
                executable,
                environment,
            );
            return Some(match result {
                Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
                Err(error) => error.response(&id),
            });
        }
        let operation = match method {
            "codexRuntime/openLocalFile" => "open",
            "codexRuntime/tabContextAsset/create" => "create",
            "codexRuntime/tabContextAsset/appendChunk" => "append",
            "codexRuntime/tabContextAsset/finish" => "finish",
            "codexRuntime/tabContextAsset/remove" | "codexRuntime/tabContextAsset/abort" => {
                "remove"
            }
            _ => return None,
        };
        let params = &message["params"];
        let result = (|| -> io::Result<Value> {
            if operation == "open" {
                crate::open_local_file::open(required(params, "path")?)?;
                return Ok(json!({}));
            }
            // Validate arguments before creating any directory or file.
            let key = if operation == "create" {
                "fileName"
            } else {
                "assetId"
            };
            let value = required(params, key)?;
            let data = if operation == "append" {
                Some(required(params, "dataBase64")?)
            } else {
                None
            };
            if self.assets.is_none() {
                fs::DirBuilder::new().mode(0o700).create(&self.directory)?;
                match AssetStore::new(&self.directory) {
                    Ok(store) => {
                        let metadata = fs::symlink_metadata(&self.directory)?;
                        self.directory_identity = Some((metadata.dev(), metadata.ino()));
                        self.assets = Some(store);
                    }
                    Err(error) => {
                        let _ = fs::remove_dir(&self.directory);
                        return Err(error);
                    }
                }
            }
            let store = self.assets.as_mut().expect("initialized above");
            match operation {
                "create" => store.create(value),
                "append" => store.append(value, data.expect("validated above")),
                "finish" => store.finish(value),
                _ => store.remove(value),
            }
        })();
        // Original string_result_response uses positive integer error code 1.
        let id = message.get("id").cloned().unwrap_or(Value::Null);
        Some(match result {
            Ok(value) => json!({"jsonrpc":"2.0", "id":id, "result":value}),
            Err(error) => {
                json!({"jsonrpc":"2.0", "id":id, "error":{"code":1,"message":error.to_string()}})
            }
        })
    }
}
fn required<'a>(params: &'a Value, key: &str) -> io::Result<&'a str> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("Missing nonempty string parameter: {key}"),
            )
        })
}
impl Drop for NativeControl {
    fn drop(&mut self) {
        crate::app_server_proxy::shutdown_proxy(&mut self.proxy);
        if let Some(mut assets) = self.assets.take() {
            let _ = assets.shutdown();
            drop(assets);
            // Never recursively remove the directory or unknown files.
            if let Ok(metadata) = fs::symlink_metadata(&self.directory) {
                if metadata.is_dir()
                    && Some((metadata.dev(), metadata.ino())) == self.directory_identity
                {
                    let _ = fs::remove_dir(&self.directory);
                }
            }
        }
    }
}
