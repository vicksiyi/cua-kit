use core_runtime_supervisor::authenticated_fetch::{
    outbound_passthrough_request, AuthenticatedFetchRequest, FetchHeader,
};
use url::Url;
fn request(method: &str, body: Option<&str>) -> AuthenticatedFetchRequest {
    AuthenticatedFetchRequest {
        method: method.into(),
        url: "original input is not reparsed here".into(),
        headers: vec![],
        body_base64: body.map(str::to_string),
    }
}
fn url() -> Url {
    Url::parse("https://fixture.invalid/exact?q=1#fragment").unwrap()
}
#[test]
fn preserves_method_url_headers_and_decoded_bytes() {
    let mut input = request("custom-Method", Some("AP9h"));
    input.headers = vec![
        FetchHeader {
            name: "X-Fixture".into(),
            value: "one".into(),
        },
        FetchHeader {
            name: "X-Fixture".into(),
            value: "two\r\n".into(),
        },
    ];
    let output = outbound_passthrough_request(&input, url()).unwrap();
    assert_eq!(output.method.as_str(), "custom-Method");
    assert_eq!(output.url, url());
    assert_eq!(output.body, vec![0, 255, b'a']);
    assert_eq!(output.headers, input.headers);
    input.headers.clear();
    assert_eq!(output.headers.len(), 2);
}
#[test]
fn exact_validation_order_and_base64_rules() {
    assert_eq!(
        outbound_passthrough_request(&request("bad method", Some("%%%")), url()).unwrap_err(),
        "nodeRepl.fetch method is invalid"
    );
    for method in ["", " GET", "GET\n", "é"] {
        assert_eq!(
            outbound_passthrough_request(&request(method, None), url()).unwrap_err(),
            "nodeRepl.fetch method is invalid"
        );
    }
    for body in ["Zg", "Zg=", "Zg==\n", "Zh==", "____"] {
        assert_eq!(
            outbound_passthrough_request(&request("POST", Some(body)), url()).unwrap_err(),
            "nodeRepl.fetch body is invalid"
        );
    }
    for body in [None, Some("")] {
        assert!(outbound_passthrough_request(&request("GET", body), url())
            .unwrap()
            .body
            .is_empty());
    }
    assert_eq!(
        outbound_passthrough_request(&request("GET", Some("Zg==")), url())
            .unwrap()
            .body,
        b"f"
    );
}

use core_runtime_supervisor::authenticated_fetch::{
    resolved_request, FetchRuntimeMode, ResolvedRequest,
};
fn route(method: &str, url: &str) -> AuthenticatedFetchRequest {
    AuthenticatedFetchRequest {
        url: url.into(),
        ..request(method, None)
    }
}
#[test]
fn default_routes_preserve_authority_boundary_and_validation_order() {
    let normal = FetchRuntimeMode::Default;
    for address in [
        "https://chatgpt.com/anything?q=1#f",
        "https://CHATGPT.COM:443/anything",
    ] {
        assert!(matches!(
            resolved_request(&route("get", address), normal),
            Ok(ResolvedRequest::Authenticated(_))
        ));
    }
    for address in [
        "https://chatgpt.com:444/a",
        "https://user@chatgpt.com/a",
        "https://chatgpt.com./a",
        "http://chatgpt.com/a",
        "https://chatgpt-staging.com/a",
        "file:///tmp/fixture",
        "https://fixture.invalid/a",
    ] {
        assert!(matches!(
            resolved_request(&route("POST", address), normal),
            Ok(ResolvedRequest::Passthrough(_))
        ));
    }
    let mut input = route("POST", "https://chatgpt.com/a");
    input.headers.push(FetchHeader {
        name: "x".into(),
        value: "y".into(),
    });
    input.body_base64 = Some("invalid".into());
    assert_eq!(
        resolved_request(&input, normal).unwrap_err(),
        "nodeRepl.fetch only allows GET for this route"
    );
    input.method = "GET".into();
    assert_eq!(
        resolved_request(&input, normal).unwrap_err(),
        "nodeRepl.fetch does not allow caller headers for this route"
    );
    input.headers.clear();
    assert_eq!(
        resolved_request(&input, normal).unwrap_err(),
        "nodeRepl.fetch does not allow caller bodies for this route"
    );
    input.body_base64 = Some(String::new());
    assert!(resolved_request(&input, normal).is_ok());
    for path in ["/ces/v1/rgstr", "/backend-api/flora/browser/redeem-otp"] {
        input.url = format!("https://chatgpt.com{path}");
        input.method = "pOsT".into();
        input.body_base64 = Some("YQ==".into());
        input.headers = vec![FetchHeader {
            name: "x".into(),
            value: "y".into(),
        }];
        assert!(matches!(
            resolved_request(&input, normal),
            Ok(ResolvedRequest::Authenticated(_))
        ));
    }
}
#[test]
fn gaas_allowlist_is_exact_and_remains_passthrough() {
    let gaas = FetchRuntimeMode::GaasBrowser;
    for (method, host, path) in [
        ("GET", "chatgpt.com", "/backend-api/aura/identity"),
        ("GET", "chatgpt.com", "/backend-api/aura/site_status"),
        ("GET", "chatgpt.com", "/backend-api/browser/site_status"),
        ("GET", "chatgpt-staging.com", "/backend-api/aura/identity"),
        (
            "GET",
            "chatgpt-staging.com",
            "/backend-api/aura/site_status",
        ),
        ("POST", "chatgpt.com", "/ces/v1/rgstr"),
        (
            "POST",
            "chatgpt.com",
            "/backend-api/flora/browser/redeem-otp",
        ),
        ("post", "ab.chatgpt.com", "/v1/fixture"),
        (
            "POST",
            "o33249.ingest.us.sentry.io",
            "/api/4511236780326912/envelope/",
        ),
    ] {
        let address = format!("https://{host}{path}?query=1#f");
        assert!(
            matches!(
                resolved_request(&route(method, &address), gaas),
                Ok(ResolvedRequest::Passthrough(_))
            ),
            "{address}"
        );
        assert!(
            resolved_request(&route(method, &address.replace("https:", "http:")), gaas).is_err()
        );
        assert!(resolved_request(
            &route(method, &address.replace(host, &format!("{host}:444"))),
            gaas
        )
        .is_err());
    }
    for address in [
        "https://chatgpt.com/",
        "https://chatgpt.com/backend-api/aura/identity/",
        "https://chatgpt-staging.com/backend-api/browser/site_status",
        "https://ab.chatgpt.com/v1",
        "https://fixture.invalid/v1/",
        "https://user@chatgpt.com/backend-api/aura/identity",
    ] {
        assert_eq!(
            resolved_request(&route("POST", address), gaas).unwrap_err(),
            "nodeRepl.fetch destination is not allowed in gaas-browser runtime mode"
        );
    }
    assert_eq!(
        resolved_request(&route("GET", "not a URL"), gaas).unwrap_err(),
        "nodeRepl.fetch URL is invalid"
    );
}
