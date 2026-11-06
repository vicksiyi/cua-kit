use core_browser_extension_host::app_server_output::{payload, OutputReplay, INITIALIZE_ID};
use serde_json::json;

#[test]
fn replay_distinguishes_presence_from_null_and_keeps_exact_wire_text() {
    let mut replay = OutputReplay::default();
    let response = format!(" {{\"id\":\"{INITIALIZE_ID}\",\"result\":null}} ");
    replay.observe_initialize(&response, 2, 1);
    assert!(replay.initialize_response.is_none());
    replay.observe_initialize(&response, 2, 2);
    assert_eq!(
        replay.initialize_response.as_deref(),
        Some(response.as_str())
    );
    for value in [
        json!({"id":INITIALIZE_ID,"error":{}}),
        json!({"id":INITIALIZE_ID,"result":{},"method":null}),
        json!({"id":"other","result":{}}),
    ] {
        replay.observe_initialize(&value.to_string(), 2, 2);
        assert_eq!(
            replay.initialize_response.as_deref(),
            Some(response.as_str())
        );
    }
    for id in [json!(null), json!(0), json!({}), json!([])] {
        assert!(replay.buffer_unattached(&json!({"method":"","id":id}).to_string(), 2, 2));
    }
    for line in [
        "bad json",
        "null",
        "[]",
        r#"{"method":"notification"}"#,
        r#"{"method":null,"id":1}"#,
    ] {
        assert!(!replay.buffer_unattached(line, 2, 2));
    }
    assert!(!replay.buffer_unattached(r#"{"method":"old","id":1}"#, 2, 1));
}

#[test]
fn replay_caps_at_128_without_eviction_and_line_trimming_is_only_cr_lf() {
    let mut replay = OutputReplay::default();
    for index in 0..130 {
        assert_eq!(
            replay.buffer_unattached(&json!({"method":"request","id":index}).to_string(), 3, 3),
            index < 128
        );
    }
    assert_eq!(replay.pending_requests.len(), 128);
    assert!(replay.pending_requests[0].contains("\"id\":0"));
    assert!(replay.pending_requests[127].contains("\"id\":127"));
    assert_eq!(payload(" \t\r\n\r\n"), Some(" \t"));
    assert_eq!(payload("\r\n\r"), None);
    assert_eq!(payload("{} \r\n"), Some("{} "));
}
