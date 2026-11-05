use core_browser_extension_host::rpc_router::{Destination, RpcRouter};
use serde_json::{json, Value};
fn request(id: Value) -> Value {
    json!({"jsonrpc":"2.0","id":id,"method":"getInfo"})
}
#[test]
fn colliding_ids_out_of_order_and_void_reply() {
    let mut r = RpcRouter::new(100, 8);
    r.add_client("a").unwrap();
    r.add_client("b").unwrap();
    let a = r.from_client("a", request(json!(7)), 0).unwrap().remove(0);
    let b = r.from_client("b", request(json!(7)), 0).unwrap().remove(0);
    assert_ne!(a.message["id"], b.message["id"]);
    let result = r
        .from_extension(
            json!({"jsonrpc":"2.0","id":b.message["id"],"result":"b"}),
            1,
        )
        .unwrap();
    assert_eq!(result[0].destination, Destination::Client("b".into()));
    assert_eq!(result[0].message["id"], 7);
    let result = r
        .from_extension(json!({"jsonrpc":"2.0","id":a.message["id"]}), 2)
        .unwrap();
    assert_eq!(result[0].destination, Destination::Client("a".into()));
    assert!(result[0].message.get("result").is_none());
    assert_eq!(r.pending_counts(), (0, 0));
}
#[test]
fn disconnect_and_timeout_discard_late_responses() {
    let mut r = RpcRouter::new(10, 8);
    r.add_client("a").unwrap();
    let first = r.from_client("a", request(json!(1)), 0).unwrap().remove(0);
    assert!(r.expire(9).is_empty());
    let errors = r.expire(10);
    assert_eq!(errors[0].message["id"], 1);
    assert!(r
        .from_extension(
            json!({"jsonrpc":"2.0","id":first.message["id"],"result":"late"}),
            11
        )
        .unwrap()
        .is_empty());
    let second = r.from_client("a", request(json!(1)), 12).unwrap().remove(0);
    r.remove_client("a");
    r.add_client("a").unwrap();
    assert!(r
        .from_extension(
            json!({"jsonrpc":"2.0","id":second.message["id"],"result":"old connection"}),
            13
        )
        .unwrap()
        .is_empty());
    assert_eq!(r.pending_counts(), (0, 0));
}
#[test]
fn heartbeat_requires_response_and_ignores_duplicate_client_reply() {
    let mut r = RpcRouter::new(10, 8);
    r.add_client("a").unwrap();
    r.add_client("b").unwrap();
    let ping = r
        .from_extension(json!({"jsonrpc":"2.0","id":2,"method":"ping"}), 0)
        .unwrap();
    assert_eq!(ping.len(), 2);
    let id = &ping[0].message["id"];
    assert!(r
        .from_client("a", json!({"jsonrpc":"2.0","id":id,"error":{}}), 1)
        .unwrap()
        .is_empty());
    assert!(r
        .from_client("a", json!({"jsonrpc":"2.0","id":id,"result":"spoof"}), 1)
        .unwrap()
        .is_empty());
    let pong = r
        .from_client("b", json!({"jsonrpc":"2.0","id":id,"result":"pong"}), 1)
        .unwrap();
    assert_eq!(
        pong[0].message,
        json!({"jsonrpc":"2.0","id":2,"result":"pong"})
    );
    assert!(r
        .from_client("b", json!({"jsonrpc":"2.0","id":id,"result":"again"}), 2)
        .unwrap()
        .is_empty());
}
#[test]
fn heartbeat_disconnect_and_deadline_return_error() {
    let mut r = RpcRouter::new(10, 8);
    r.add_client("a").unwrap();
    r.from_extension(json!({"jsonrpc":"2.0","id":1,"method":"ping"}), 0)
        .unwrap();
    assert_eq!(
        r.expire(10)[0].message["error"]["message"],
        "Browser client response timed out"
    );
    r.from_extension(json!({"jsonrpc":"2.0","id":2,"method":"ping"}), 10)
        .unwrap();
    assert_eq!(
        r.remove_client("a")[0].message["error"]["message"],
        "No connected browser client"
    );
    assert_eq!(r.pending_counts(), (0, 0));
}
#[test]
fn capacities_are_separate_and_invalid_messages_do_not_allocate() {
    let mut r = RpcRouter::new(10, 1);
    r.add_client("a").unwrap();
    for value in [
        json!(null),
        json!([]),
        json!({"jsonrpc":"1.0"}),
        json!({"jsonrpc":"2.0","id":null}),
        json!({"jsonrpc":"2.0","method":true}),
    ] {
        assert!(r.from_client("a", value, 0).is_err());
    }
    assert_eq!(r.pending_counts(), (0, 0));
    r.from_client("a", request(json!(1)), 0).unwrap();
    assert!(r.from_client("a", request(json!(2)), 0).is_err());
    r.from_extension(json!({"jsonrpc":"2.0","id":3,"method":"ping"}), 0)
        .unwrap();
    assert!(r
        .from_extension(json!({"jsonrpc":"2.0","id":4,"method":"ping"}), 0)
        .is_err());
    r.close();
    assert_eq!(r.pending_counts(), (0, 0));
    assert!(r.from_client("a", request(json!(3)), 0).is_err());
}
#[test]
fn notifications_do_not_allocate_and_failed_delivery_rolls_back() {
    let mut r = RpcRouter::new(10, 1);
    r.add_client("a").unwrap();
    r.add_client("b").unwrap();
    let notification = json!({"jsonrpc":"2.0","method":"onCDPEvent","params":{}});
    assert_eq!(r.from_extension(notification.clone(), 0).unwrap().len(), 2);
    assert_eq!(r.from_client("a", notification, 0).unwrap().len(), 1);
    assert_eq!(r.pending_counts(), (0, 0));
    let delivery = r.from_client("a", request(json!(1)), 0).unwrap().remove(0);
    r.delivery_failed(&delivery);
    assert_eq!(r.pending_counts(), (0, 0));
    assert!(r.expire(20).is_empty());
}
#[test]
fn invalid_or_unknown_extension_requests_cannot_be_forwarded() {
    let mut r = RpcRouter::new(10, 1);
    assert!(r
        .from_extension(json!({"jsonrpc":"2.0","method":3}), 0)
        .is_err());
    let error = r.from_extension(request(json!(1)), 0).unwrap();
    assert_eq!(error[0].message["error"]["code"], -32601);
    let error = r
        .from_extension(json!({"jsonrpc":"2.0","id":2,"method":"ping"}), 0)
        .unwrap();
    assert_eq!(
        error[0].message["error"]["message"],
        "No connected browser client"
    );
}
