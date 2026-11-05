//! Host-owned fetch lifetime can outlive one JS cell, but never its worker pair.
use crate::host::{HostHandler, HostRequest};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use tokio::task::JoinSet;
struct Context {
    meta: Value,
    allowed: bool,
    seen: HashSet<String>,
    handler: Option<HostHandler>,
}
#[derive(Default)]
pub struct BackgroundHost {
    contexts: HashMap<String, Context>,
    order: VecDeque<String>,
    tasks: JoinSet<Value>,
}
impl BackgroundHost {
    pub fn register(
        &mut self,
        id: String,
        meta: Value,
        allowed: bool,
        handler: Option<HostHandler>,
    ) {
        self.order.push_back(id.clone());
        self.contexts.insert(
            id,
            Context {
                meta,
                allowed,
                seen: HashSet::new(),
                handler,
            },
        );
        while self.order.len() > 256 {
            if let Some(id) = self.order.pop_front() {
                self.contexts.remove(&id);
            }
        }
    }
    pub fn allow(&mut self, id: &str) {
        if let Some(context) = self.contexts.get_mut(id) {
            context.allowed = true;
        }
    }
    /// Immediate errors are returned without creating unbounded response tasks.
    pub fn start(&mut self, message: Value) -> Option<Value> {
        let id = message["id"].as_str().unwrap_or("").to_string();
        let exec = message["exec_id"].as_str().unwrap_or("").to_string();
        let reject = |error: &str| Some(json!({"id":id,"ok":false,"error":error}));
        let Some(context) = self.contexts.get_mut(&exec) else {
            return reject("Unknown background execution context");
        };
        if id.is_empty() || message["type"] != "authenticated_fetch" || !context.allowed {
            return reject("Unauthorized background execution context");
        }
        if context.seen.contains(&id) {
            return reject("Duplicate background request identity");
        }
        if context.seen.len() >= 1024 || self.tasks.len() >= 64 {
            return reject("Background request budget exceeded");
        }
        context.seen.insert(id.clone());
        let Some(handler) = context.handler.clone() else {
            return reject("Background host handler is not configured");
        };
        let request = HostRequest {
            message,
            execution_id: exec,
            request_meta: context.meta.clone(),
        };
        self.tasks.spawn(async move {
            let mut response = match handler(request).await {
                Ok(reply) if reply.message.is_object() && reply.content.is_empty() => reply.message,
                Ok(_) => json!({"ok":false,"error":"Background fetch cannot append content or return a non-object"}),
                Err(error) => json!({"ok":false,"error":error}),
            };
            response["id"] = json!(id);
            response
        });
        None
    }
    pub fn pending(&self) -> bool {
        !self.tasks.is_empty()
    }
    pub async fn next(&mut self) -> Result<Value, String> {
        self.tasks
            .join_next()
            .await
            .ok_or("Missing background host task")?
            .map_err(|error| error.to_string())
    }
    pub async fn close(&mut self) {
        self.tasks.abort_all();
        while self.tasks.join_next().await.is_some() {}
        self.contexts.clear();
        self.order.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::HostReply;
    use std::sync::Arc;
    #[tokio::test]
    async fn retains_origin_context_and_rejects_replay() {
        let mut host = BackgroundHost::default();
        let handler: HostHandler = Arc::new(|r| {
            Box::pin(async move {
                assert_eq!(r.request_meta, json!({"origin":1}));
                Ok(HostReply::message(json!({"ok":true,"id":"forged"})))
            })
        });
        host.register("one".into(), json!({"origin":1}), false, Some(handler));
        let message = json!({"type":"authenticated_fetch","id":"req","exec_id":"one"});
        assert_eq!(host.start(message.clone()).unwrap()["ok"], false);
        host.allow("one");
        assert!(host.start(message.clone()).is_none());
        // A later cell must not replace the originating request metadata/handler.
        host.register("two".into(), json!({"origin":2}), true, None);
        assert_eq!(host.next().await.unwrap(), json!({"ok":true,"id":"req"}));
        assert_eq!(host.start(message.clone()).unwrap()["ok"], false);
        host.close().await;
        assert_eq!(host.start(message).unwrap()["ok"], false);
    }
    #[tokio::test]
    async fn close_drops_inflight_callback() {
        struct Guard(tokio::sync::oneshot::Sender<()>);
        impl Drop for Guard {
            fn drop(&mut self) {
                let (replacement, _) = tokio::sync::oneshot::channel();
                let _ = std::mem::replace(&mut self.0, replacement).send(());
            }
        }
        let (started, mut receiver) = tokio::sync::mpsc::channel(1);
        let (dropped, completed) = tokio::sync::oneshot::channel();
        let dropped = Arc::new(std::sync::Mutex::new(Some(dropped)));
        let handler: HostHandler = Arc::new(move |_| {
            let guard = Guard(dropped.lock().unwrap().take().unwrap());
            let started = started.clone();
            Box::pin(async move {
                let _guard = guard;
                started.send(()).await.unwrap();
                std::future::pending().await
            })
        });
        let mut host = BackgroundHost::default();
        host.register("one".into(), Value::Null, true, Some(handler));
        assert!(host
            .start(json!({"type":"authenticated_fetch","id":"req","exec_id":"one"}))
            .is_none());
        receiver.recv().await.unwrap();
        host.close().await;
        completed.await.unwrap();
        assert!(!host.pending());
    }
}
