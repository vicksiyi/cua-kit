use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use core_runtime_supervisor::{
    authenticated_fetch::{
        fetch_with_auth, AuthenticatedFetchRequest, FetchAuthProvider, FetchFuture,
        FetchHttpClient, FetchResponse, FetchRuntimeMode, OutboundRequest,
    },
    codex_app_server_auth::{AccessTokenFetcher, AuthUserObserver, CodexAppServerAuthProvider},
};
use serde_json::json;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Fixture {
    tokens: Mutex<VecDeque<Result<String, String>>>,
    events: Mutex<Vec<String>>,
    requests: Mutex<Vec<OutboundRequest>>,
    statuses: Mutex<VecDeque<u16>>,
}
impl AccessTokenFetcher for Fixture {
    fn fetch_access_token(&self, refresh: bool) -> FetchFuture<'_, String> {
        Box::pin(async move {
            self.events.lock().unwrap().push(format!("fetch:{refresh}"));
            self.tokens
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected fetch")
        })
    }
}
impl AuthUserObserver for Fixture {
    fn set_user(&self, user: Option<&str>) {
        self.events.lock().unwrap().push(format!("user:{user:?}"));
    }
}
impl FetchHttpClient for Fixture {
    fn send(&self, request: OutboundRequest) -> FetchFuture<'_, FetchResponse> {
        Box::pin(async move {
            self.events.lock().unwrap().push("send".into());
            self.requests.lock().unwrap().push(request);
            Ok(FetchResponse {
                status: self
                    .statuses
                    .lock()
                    .unwrap()
                    .pop_front()
                    .expect("unexpected send"),
                status_text: String::new(),
                headers: vec![],
                body_base64: String::new(),
            })
        })
    }
}
fn synthetic_token(account: &str, user: &str) -> String {
    format!(
        "h.{}.s",
        URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&json!({
                "https://api.openai.com/auth":{"chatgpt_account_id":account,"chatgpt_user_id":user}
            }))
            .unwrap()
        )
    )
}
fn request() -> AuthenticatedFetchRequest {
    AuthenticatedFetchRequest {
        method: "GET".into(),
        url: "https://chatgpt.com/backend-api/aura/identity".into(),
        headers: vec![],
        body_base64: None,
    }
}

#[tokio::test]
async fn refresh_rebuilds_metadata_and_headers_before_second_send() {
    let fixture = Arc::new(Fixture::default());
    let first = synthetic_token("account-first", "user-first");
    let second = synthetic_token("account-second", "user-second");
    fixture
        .tokens
        .lock()
        .unwrap()
        .extend([Ok(first.clone()), Ok(second.clone())]);
    fixture.statuses.lock().unwrap().extend([401, 200]);
    let provider = CodexAppServerAuthProvider::new(fixture.clone(), fixture.clone());
    let response = fetch_with_auth(
        &request(),
        FetchRuntimeMode::Default,
        &provider,
        fixture.as_ref(),
    )
    .await
    .unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(
        *fixture.events.lock().unwrap(),
        vec![
            "fetch:false",
            "user:Some(\"user-first\")",
            "send",
            "fetch:true",
            "user:Some(\"user-second\")",
            "send"
        ]
    );
    let requests = fixture.requests.lock().unwrap();
    for (request, token, account) in [
        (&requests[0], first, "account-first"),
        (&requests[1], second, "account-second"),
    ] {
        assert!(request
            .headers
            .iter()
            .any(|h| h.name.eq_ignore_ascii_case("authorization")
                && h.value == format!("Bearer {token}")));
        assert!(request
            .headers
            .iter()
            .any(|h| h.name.eq_ignore_ascii_case("chatgpt-account-id") && h.value == account));
        assert!(!request
            .headers
            .iter()
            .any(|h| h.name.eq_ignore_ascii_case("chatgpt-user-id")));
    }
}

#[tokio::test]
async fn current_auth_fetches_each_time_and_notifies_missing_user() {
    let fixture = Arc::new(Fixture::default());
    fixture
        .tokens
        .lock()
        .unwrap()
        .extend([Ok(synthetic_token("account", "user")), Ok("opaque".into())]);
    let provider = CodexAppServerAuthProvider::new(fixture.clone(), fixture.clone());
    assert_eq!(
        provider.current_auth().await.unwrap().account_id.as_deref(),
        Some("account")
    );
    let next = provider.current_auth().await.unwrap();
    assert_eq!(next.access_token, "opaque");
    assert!(next.account_id.is_none());
    assert_eq!(
        *fixture.events.lock().unwrap(),
        vec![
            "fetch:false",
            "user:Some(\"user\")",
            "fetch:false",
            "user:None"
        ]
    );
}

#[tokio::test]
async fn fetch_errors_do_not_notify_or_send_and_refresh_errors_stop_replay() {
    for refresh_failure in [false, true] {
        let fixture = Arc::new(Fixture::default());
        if refresh_failure {
            fixture
                .tokens
                .lock()
                .unwrap()
                .push_back(Ok("opaque".into()));
            fixture.statuses.lock().unwrap().push_back(401);
        }
        fixture
            .tokens
            .lock()
            .unwrap()
            .push_back(Err("synthetic RPC failure".into()));
        let provider = CodexAppServerAuthProvider::new(fixture.clone(), fixture.clone());
        let error = fetch_with_auth(
            &request(),
            FetchRuntimeMode::Default,
            &provider,
            fixture.as_ref(),
        )
        .await
        .unwrap_err();
        assert_eq!(error, "synthetic RPC failure");
        let expected = if refresh_failure {
            vec!["fetch:false", "user:None", "send", "fetch:true"]
        } else {
            vec!["fetch:false"]
        };
        assert_eq!(*fixture.events.lock().unwrap(), expected);
        assert_eq!(
            fixture.requests.lock().unwrap().len(),
            usize::from(refresh_failure)
        );
    }
}
