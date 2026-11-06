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
