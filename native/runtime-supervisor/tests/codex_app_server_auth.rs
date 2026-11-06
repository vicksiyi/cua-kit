use base64::{
    engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD},
    Engine,
};
use core_runtime_supervisor::codex_app_server_auth::chatgpt_auth_claim_from_token as claim;
use serde_json::json;

fn token(value: serde_json::Value) -> String {
    format!(
        "unverified.{}.ignored",
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(&value).unwrap())
    )
}

#[test]
fn preserves_string_claims_and_does_not_validate_token_envelope() {
    let payload = json!({"exp":0,"https://api.openai.com/auth":{"account":"synthetic-account","empty":"","unicode":"用户"}});
    let full = token(payload);
    for candidate in [
        full.clone(),
        full.rsplit_once('.').unwrap().0.to_owned(),
        format!("{full}.extra"),
    ] {
        assert_eq!(
            claim(&candidate, "account").as_deref(),
            Some("synthetic-account")
        );
        assert_eq!(claim(&candidate, "empty").as_deref(), Some(""));
        assert_eq!(claim(&candidate, "unicode").as_deref(), Some("用户"));
    }
    let payload = full.split('.').nth(1).unwrap();
    assert_eq!(
        claim(&format!(".{payload}"), "account").as_deref(),
        Some("synthetic-account")
    );
}

#[test]
fn requires_nested_string_without_coercing_other_json_types() {
    for value in [
        json!(null),
        json!([]),
        json!({"account":"wrong-level"}),
        json!({"https://api.openai.com/auth":null}),
    ] {
        assert_eq!(claim(&token(value), "account"), None);
    }
    for value in [json!(null), json!(false), json!(42), json!([]), json!({})] {
        assert_eq!(
            claim(
                &token(json!({"https://api.openai.com/auth":{"account":value}})),
                "account"
            ),
            None
        );
    }
    assert_eq!(
        claim(
            &token(json!({"https://api.openai.com/auth":{"account":"ok"}})),
            "missing"
        ),
        None
    );
}

#[test]
fn rejects_malformed_payloads_padding_and_noncanonical_tail_bits() {
    for token in [
        "",
        "no-separator",
        "header.",
        "header.!!!!.sig",
        "header.Zg.sig",
        "header._w.sig",
        "header.e30=.sig",
        "header.e31.sig",
    ] {
        assert_eq!(claim(token, "account"), None, "{token}");
    }
    // Generate valid JSON whose encoding requires padding, so the negative case
    // tests base64 policy rather than merely malformed JSON or a missing claim.
    let mut value = String::from("x");
    loop {
        let bytes =
            serde_json::to_vec(&json!({"https://api.openai.com/auth":{"account":value}})).unwrap();
        if bytes.len() % 3 != 0 {
            let encoded = URL_SAFE.encode(&bytes);
            assert!(encoded.ends_with('='));
            assert_eq!(claim(&format!("h.{encoded}.s"), "account"), None);
            let canonical = URL_SAFE_NO_PAD.encode(&bytes);
            assert_eq!(
                claim(&format!("h.{canonical}.s"), "account"),
                Some(value.clone())
            );
            // Last symbol has unused bits; changing only those must be rejected.
            let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
            let mut corrupt = canonical.into_bytes();
            let last = corrupt.last_mut().unwrap();
            let index = alphabet.iter().position(|c| c == last).unwrap();
            *last = alphabet[index + 1];
            assert_eq!(
                claim(
                    &format!("h.{}.s", String::from_utf8(corrupt).unwrap()),
                    "account"
                ),
                None
            );
            break;
        }
        value.push('x');
    }
}

#[test]
fn auth_status_request_preserves_both_boolean_fields() {
    use core_runtime_supervisor::codex_app_server_auth::{auth_status_params, AUTH_STATUS_METHOD};
    assert_eq!(AUTH_STATUS_METHOD, "getAuthStatus");
    for refresh in [false, true] {
        assert_eq!(
            auth_status_params(refresh),
            json!({"includeToken":true,"refreshToken":refresh})
        );
    }
}

#[test]
fn auth_status_validates_token_before_exact_auth_method() {
    use core_runtime_supervisor::codex_app_server_auth::access_token_from_auth_status as parse;
    for response in [
        json!(null),
        json!([]),
        json!({}),
        json!({"authToken":"","authMethod":"apikey"}),
        json!({"authToken":42,"authMethod":"chatgpt"}),
    ] {
        assert_eq!(
            parse(&response).unwrap_err(),
            "Codex auth token is unavailable"
        );
    }
    for response in [
        json!({"authToken":"synthetic"}),
        json!({"authToken":"synthetic","authMethod":null}),
        json!({"authToken":"synthetic","authMethod":42}),
    ] {
        assert_eq!(
            parse(&response).unwrap_err(),
            "Codex auth method is unavailable"
        );
    }
    for method in ["", "apikey", "ChatGPT", "chatgpt ", "chatgptAuthTokens"] {
        assert_eq!(
            parse(&json!({"authToken":"synthetic","authMethod":method})).unwrap_err(),
            format!("unsupported Codex auth method: {method}")
        );
    }
    // Only length is checked; do not invent whitespace trimming or JWT validation.
    for value in [" ", "opaque-synthetic-token"] {
        assert_eq!(
            parse(&json!({"authToken":value,"authMethod":"chatgpt","ignored":true})).unwrap(),
            value
        );
    }
}

#[test]
fn native_auth_projection_keeps_account_and_user_claims_distinct() {
    use core_runtime_supervisor::codex_app_server_auth::CodexAuth;
    let source = token(
        json!({"https://api.openai.com/auth":{"chatgpt_account_id":"account-a","chatgpt_user_id":"user-b"}}),
    );
    let auth = CodexAuth::from_access_token(source.clone());
    assert_eq!(auth.user_id.as_deref(), Some("user-b"));
    assert_eq!(auth.account_id.as_deref(), Some("account-a"));
    let credentials = auth.into_fetch_credentials();
    assert_eq!(credentials.access_token, source);
    assert_eq!(credentials.account_id.as_deref(), Some("account-a"));
    let opaque = CodexAuth::from_access_token("opaque".into());
    assert!(opaque.account_id.is_none());
    assert!(opaque.user_id.is_none());
    assert_eq!(opaque.access_token, "opaque");
}
