use core_browser_extension_host::app_server_status::status;
use serde_json::json;

#[test]
fn absence_and_existing_proxy_are_distinct_even_with_empty_session_id() {
    assert_eq!(status(None), json!({"phase":"idle"}));
    for id in ["", "session-1", " 会话\n\" "] {
        assert_eq!(status(Some(id)), json!({"phase":"connected", "runtimeSessionId":id}));
        // A snapshot must remain owned after the source session changes.
        let mut session = id.to_owned();
        let snapshot = status(Some(&session));
        session.clear();
        assert_eq!(snapshot["runtimeSessionId"], id);
    }
}
