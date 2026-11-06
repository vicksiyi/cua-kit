use core_runtime_supervisor::codex_app_server_auth::{AuthUserObserver, SentryAuthUserObserver};
use sentry_core::{Client, ClientOptions, Envelope, Hub, Scope, Transport};
use std::sync::Arc;

struct NoSend;
impl Transport for NoSend {
    fn send_envelope(&self, _: Envelope) {
        panic!("scope updates must not emit telemetry");
    }
}

#[test]
fn active_sentry_scope_replaces_user_preserves_empty_id_and_clears_absence() {
    let client = Client::from_config((
        "https://fixture@example.invalid/1",
        ClientOptions::new().transport(Arc::new(NoSend)),
    ));
    assert!(client.is_enabled());
    let hub = Arc::new(Hub::new(Some(Arc::new(client)), Arc::new(Scope::default())));
    Hub::run(hub.clone(), || {
        hub.configure_scope(|scope| scope.set_user(Some(sentry_core::protocol::User {
            id: Some("old".into()), email: Some("old@example.invalid".into()),
            ..Default::default()
        })));
        for user_id in [Some("fixture-user"), Some(""), None] {
            SentryAuthUserObserver.set_user(user_id);
            let event = hub.configure_scope(|scope| {
                scope.apply_to_event(sentry_core::protocol::Event::default()).unwrap()
            });
            assert_eq!(event.user.as_ref().and_then(|user| user.id.as_deref()), user_id);
            if let Some(user) = event.user {
                assert!(user.email.is_none());
                assert!(user.username.is_none());
                assert!(user.other.is_empty());
            } else {
                assert!(user_id.is_none());
            }
        }
    });
}

#[test]
fn inactive_hub_does_not_acquire_a_client_or_mutate_scope() {
    let hub = Arc::new(Hub::new(None, Arc::new(Scope::default())));
    Hub::run(hub.clone(), || {
        SentryAuthUserObserver.set_user(Some("fixture-user"));
        assert!(hub.client().is_none());
        let event = hub.configure_scope(|scope| {
            scope.apply_to_event(sentry_core::protocol::Event::default()).unwrap()
        });
        assert!(event.user.is_none());
    });
}
