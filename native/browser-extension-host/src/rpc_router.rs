//! Stateful routing core. The eventual native event loop supplies monotonic ticks
//! and delivers returned actions through bounded client writers. No JS callbacks.
//! IDs/error strings preserve the current Core protocol, not proven vendor details.
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq)]
pub enum Destination {
    Extension,
    Client(String),
}
#[derive(Debug, Clone, PartialEq)]
pub struct Delivery {
    pub destination: Destination,
    pub message: Value,
}
struct Pending {
    client: String,
    original_id: Value,
    deadline: u64,
}
struct Reverse {
    original_id: Value,
    waiting: BTreeSet<String>,
    deadline: u64,
}
pub struct RpcRouter {
    clients: Vec<String>,
    pending: BTreeMap<String, Pending>,
    reverse: BTreeMap<String, Reverse>,
    next_id: u64,
    timeout: u64,
    capacity: usize,
}
fn validate(value: &Value) -> Result<(), &'static str> {
    let object = value.as_object().ok_or("Invalid RPC message")?;
    if value.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Err("Expected JSON-RPC 2.0");
    }
    if let Some(id) = object.get("id") {
        if !id.is_string() && !id.is_number() {
            return Err("Invalid RPC id");
        }
    }
    if let Some(method) = object.get("method") {
        if !method.is_string() {
            return Err("Invalid RPC method");
        }
    }
    Ok(())
}
fn error(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
fn extension(message: Value) -> Delivery {
    Delivery {
        destination: Destination::Extension,
        message,
    }
}
fn client(id: &str, message: Value) -> Delivery {
    Delivery {
        destination: Destination::Client(id.to_owned()),
        message,
    }
}
impl RpcRouter {
    pub fn new(timeout_ticks: u64, capacity: usize) -> Self {
        Self {
            clients: Vec::new(),
            pending: BTreeMap::new(),
            reverse: BTreeMap::new(),
            next_id: 0,
            timeout: timeout_ticks,
            capacity,
        }
    }
    fn id(&mut self, prefix: &str) -> Result<String, &'static str> {
        self.next_id = self
            .next_id
            .checked_add(1)
            .ok_or("Native host request ID exhausted")?;
        Ok(format!("{prefix}:{}", self.next_id))
    }
    pub fn add_client(&mut self, id: &str) -> Result<(), &'static str> {
        if self.clients.iter().any(|value| value == id) {
            return Err("Duplicate client");
        }
        self.clients.push(id.to_owned());
        Ok(())
    }
    pub fn remove_client(&mut self, id: &str) -> Vec<Delivery> {
        self.clients.retain(|value| value != id);
        self.pending.retain(|_, value| value.client != id);
        let finished: Vec<String> = self
            .reverse
            .iter_mut()
            .filter_map(|(key, value)| {
                value.waiting.remove(id);
                value.waiting.is_empty().then(|| key.clone())
            })
            .collect();
        finished
            .into_iter()
            .map(|key| {
                let request = self.reverse.remove(&key).unwrap();
                extension(error(
                    request.original_id,
                    -32000,
                    "No connected browser client",
                ))
            })
            .collect()
    }
    pub fn from_client(
        &mut self,
        id: &str,
        mut message: Value,
        now: u64,
    ) -> Result<Vec<Delivery>, &'static str> {
        if !self.clients.iter().any(|value| value == id) {
            return Err("Unknown client");
        }
        validate(&message)?;
        if message.get("method").is_none() {
            let Some(key) = message.get("id").and_then(Value::as_str).map(str::to_owned) else {
                return Ok(vec![]);
            };
            let Some(request) = self.reverse.get_mut(&key) else {
                return Ok(vec![]);
            };
            if !request.waiting.remove(id) {
                return Ok(vec![]);
            }
            if message.get("error").is_none() || request.waiting.is_empty() {
                let request = self.reverse.remove(&key).unwrap();
                message["id"] = request.original_id;
                return Ok(vec![extension(message)]);
            }
            return Ok(vec![]);
        }
        let Some(original_id) = message.get("id").cloned() else {
            return Ok(vec![extension(message)]);
        };
        if self.pending.len() >= self.capacity {
            return Err("Native host request capacity exceeded");
        }
        let key = self.id("core-native")?;
        self.pending.insert(
            key.clone(),
            Pending {
                client: id.to_owned(),
                original_id,
                deadline: now.saturating_add(self.timeout),
            },
        );
        message["id"] = json!(key);
        Ok(vec![extension(message)])
    }
    pub fn from_extension(
        &mut self,
        mut message: Value,
        now: u64,
    ) -> Result<Vec<Delivery>, &'static str> {
        validate(&message)?;
        if let Some(method) = message.get("method").and_then(Value::as_str) {
            let Some(original_id) = message.get("id").cloned() else {
                return Ok(self
                    .clients
                    .iter()
                    .map(|id| client(id, message.clone()))
                    .collect());
            };
            if method != "ping" {
                return Ok(vec![extension(error(
                    original_id,
                    -32601,
                    "Native host method not implemented",
                ))]);
            }
            if self.clients.is_empty() {
                return Ok(vec![extension(error(
                    original_id,
                    -32000,
                    "No connected browser client",
                ))]);
            }
            if self.reverse.len() >= self.capacity {
                return Err("Native host reverse request capacity exceeded");
            }
            let key = self.id("core-client")?;
            self.reverse.insert(
                key.clone(),
                Reverse {
                    original_id,
                    waiting: self.clients.iter().cloned().collect(),
                    deadline: now.saturating_add(self.timeout),
                },
            );
            message["id"] = json!(key);
            return Ok(self
                .clients
                .iter()
                .map(|id| client(id, message.clone()))
                .collect());
        }
        let Some(key) = message.get("id").and_then(Value::as_str) else {
            return Ok(vec![]);
        };
        let Some(request) = self.pending.remove(key) else {
            return Ok(vec![]);
        };
        message["id"] = request.original_id;
        Ok(vec![client(&request.client, message)])
    }
    /// Called by the native event loop before receiving a new message at `now`.
    /// The tick unit is the same one passed to `new`; callers must use monotonic time.
    pub fn expire(&mut self, now: u64) -> Vec<Delivery> {
        let keys: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, v)| v.deadline <= now)
            .map(|(k, _)| k.clone())
            .collect();
        let mut out = Vec::new();
        for key in keys {
            let v = self.pending.remove(&key).unwrap();
            out.push(client(
                &v.client,
                error(v.original_id, -32000, "Extension response timed out"),
            ));
        }
        let keys: Vec<String> = self
            .reverse
            .iter()
            .filter(|(_, v)| v.deadline <= now)
            .map(|(k, _)| k.clone())
            .collect();
        for key in keys {
            let v = self.reverse.remove(&key).unwrap();
            out.push(extension(error(
                v.original_id,
                -32000,
                "Browser client response timed out",
            )));
        }
        out
    }
    /// Roll back an undeliverable outbound request. The transport closes/rejects
    /// affected callers; the router must not retain an orphan until its deadline.
    pub fn delivery_failed(&mut self, delivery: &Delivery) -> Vec<Delivery> {
        match &delivery.destination {
            Destination::Client(id) => self.remove_client(id),
            Destination::Extension => {
                if delivery.message.get("method").is_some() {
                    if let Some(key) = delivery.message.get("id").and_then(Value::as_str) {
                        self.pending.remove(key);
                    }
                }
                vec![]
            }
        }
    }
    pub fn close(&mut self) {
        self.reverse.clear();
        self.pending.clear();
        self.clients.clear();
    }
    pub fn pending_counts(&self) -> (usize, usize) {
        (self.pending.len(), self.reverse.len())
    }
}
