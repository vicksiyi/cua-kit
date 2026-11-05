//! Test-only NDJSON contract harness; not a native messaging host executable.
use core_browser_extension_host::rpc_router::{Destination, RpcRouter};
use serde_json::{json, Value};
use std::io::{self, BufRead};
fn main() {
    let mut router = RpcRouter::new(1_000_000, 2);
    for line in io::stdin().lock().lines() {
        let value: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let client = value["client"].as_str().unwrap_or("");
        let result = match value["event"].as_str().unwrap() {
            "add" => router.add_client(client).map(|_| vec![]),
            "remove" => Ok(router.remove_client(client)),
            "client" => router.from_client(client, value["message"].clone(), 0),
            "extension" => router.from_extension(value["message"].clone(), 0),
            "close" => {
                router.close();
                Ok(vec![])
            }
            _ => Err("Unknown harness event"),
        };
        let output = match result {
            Ok(deliveries) => {
                json!({"deliveries":deliveries.into_iter().map(|d|json!({"destination":match d.destination{Destination::Extension=>"extension".to_string(),Destination::Client(id)=>format!("client:{id}")},"message":d.message})).collect::<Vec<_>>() })
            }
            Err(error) => json!({"error":error}),
        };
        println!("{output}");
    }
}
