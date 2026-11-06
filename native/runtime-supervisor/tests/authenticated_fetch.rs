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

#[test]
fn authenticated_headers_replace_all_reserved_names_and_preserve_other_fields() {
    use core_runtime_supervisor::authenticated_fetch::{
        outbound_authenticated_request, FetchCredentials,
    };
    let header = |name: &str, value: &str| FetchHeader {
        name: name.into(),
        value: value.into(),
    };
    let mut input = request("custom-Method", Some("AP9h"));
    input.headers = vec![
        header("X-Trace", "first"),
        header("Authorization", "caller"),
        header("authorization", "duplicate"),
        header("ORIGINATOR", "caller"),
        header("cHaTgPt-AcCoUnT-Id", "caller"),
        header("X-Trace", "second"),
        header("authorization ", "keep exact nonmatch"),
        header("", "empty name"),
        header("Öriginator", "non-ASCII nonmatch"),
    ];
    let output = outbound_authenticated_request(
        outbound_passthrough_request(&input, url()).unwrap(),
        FetchCredentials {
            access_token: "fixture-token".into(),
            account_id: Some("fixture-account".into()),
        },
    );
    assert_eq!(output.method.as_str(), "custom-Method");
    assert_eq!(output.url, url());
    assert_eq!(output.body, vec![0, 255, b'a']);
    assert_eq!(
        output.headers,
        vec![
            header("X-Trace", "first"),
            header("X-Trace", "second"),
            header("authorization ", "keep exact nonmatch"),
            header("", "empty name"),
            header("Öriginator", "non-ASCII nonmatch"),
            header("authorization", "Bearer fixture-token"),
            header("originator", "codex_browser_use"),
            header("ChatGPT-Account-ID", "fixture-account"),
        ]
    );
}

#[test]
fn authenticated_account_absence_and_empty_values_are_distinct() {
    use core_runtime_supervisor::authenticated_fetch::{
        outbound_authenticated_request, FetchCredentials,
    };
    for account_id in [None, Some(""), Some("fixture\r\nvalue")] {
        let mut input = request("GET", None);
        input.headers.push(FetchHeader {
            name: "ChatGPT-Account-ID".into(),
            value: "stale".into(),
        });
        let output = outbound_authenticated_request(
            outbound_passthrough_request(&input, url()).unwrap(),
            FetchCredentials {
                access_token: "".into(),
                account_id: account_id.map(str::to_owned),
            },
        );
        assert_eq!(output.headers[0].value, "Bearer ");
        assert_eq!(output.headers.len(), 2 + usize::from(account_id.is_some()));
        assert_eq!(output.headers.get(2).map(|h| h.value.as_str()), account_id);
    }
}

#[test]
fn response_projection_exposes_only_first_valid_content_type_and_binary_body() {
    use core_runtime_supervisor::authenticated_fetch::finish_response;
    use http::{HeaderMap, HeaderValue, StatusCode};
    let mut headers = HeaderMap::new();
    headers.append(
        "content-type",
        HeaderValue::from_static("application/octet-stream"),
    );
    headers.append(
        "content-type",
        HeaderValue::from_static("ignored second value"),
    );
    headers.insert("set-cookie", HeaderValue::from_static("fixture=private"));
    let response = finish_response(StatusCode::NOT_FOUND, &headers, &[0, 255, b'a']).unwrap();
    assert_eq!(
        serde_json::to_value(response).unwrap(),
        serde_json::json!({
            "status":404,"status_text":"Not Found","headers":[{"name":"content-type","value":"application/octet-stream"}],"body_base64":"AP9h"
        })
    );
    headers.insert("content-type", HeaderValue::from_bytes(&[0xff]).unwrap());
    assert!(finish_response(StatusCode::OK, &headers, b"")
        .unwrap()
        .headers
        .is_empty());
    headers.insert("content-type", HeaderValue::from_static(""));
    assert_eq!(
        finish_response(StatusCode::OK, &headers, b"")
            .unwrap()
            .headers[0]
            .value,
        ""
    );
    let unknown =
        finish_response(StatusCode::from_u16(599).unwrap(), &HeaderMap::new(), b"").unwrap();
    assert_eq!(unknown.status_text, "");
    assert_eq!(unknown.body_base64, "");
    assert!(unknown.headers.is_empty());
}

#[test]
fn response_size_boundary_checks_declared_and_collected_lengths() {
    use core_runtime_supervisor::authenticated_fetch::{
        check_response_content_length, finish_response, MAX_FETCH_RESPONSE_BYTES,
    };
    for length in [None, Some(0), Some(MAX_FETCH_RESPONSE_BYTES)] {
        assert_eq!(check_response_content_length(length), Ok(()));
    }
    for length in [MAX_FETCH_RESPONSE_BYTES + 1, u64::MAX] {
        assert_eq!(
            check_response_content_length(Some(length)),
            Err("nodeRepl.fetch response is too large")
        );
    }
    let body = vec![0; MAX_FETCH_RESPONSE_BYTES as usize + 1];
    assert_eq!(
        finish_response(http::StatusCode::OK, &http::HeaderMap::new(), &body).unwrap_err(),
        "nodeRepl.fetch response is too large"
    );
    assert!(finish_response(
        http::StatusCode::OK,
        &http::HeaderMap::new(),
        &body[..MAX_FETCH_RESPONSE_BYTES as usize]
    )
    .is_ok());
}

async fn response_fixture(response: Vec<u8>) -> (Url, tokio::task::JoinHandle<Vec<u8>>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = Url::parse(&format!(
        "http://{}/fixture",
        listener.local_addr().unwrap()
    ))
    .unwrap();
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        loop {
            let mut byte = [0];
            if socket.read(&mut byte).await.unwrap() == 0 {
                break;
            }
            request.push(byte[0]);
            if request.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        socket.write_all(&response).await.unwrap();
        socket.shutdown().await.unwrap();
        request
    });
    (url, task)
}

#[tokio::test]
async fn real_transport_preserves_http_error_status_and_does_not_follow_configured_redirect() {
    use core_runtime_supervisor::authenticated_fetch::send_request;
    let client = core_runtime_supervisor::authenticated_fetch::http_client_builder()
        .no_proxy()
        .build()
        .unwrap();
    for (status, reason, extra) in [
        (404, "Not Found", ""),
        (303, "See Other", "Location: /next\r\n"),
    ] {
        let response = format!("HTTP/1.1 {status} fixture reason\r\nContent-Length: 3\r\nContent-Type: application/octet-stream\r\nSet-Cookie: private=fixture\r\n{extra}Connection: close\r\n\r\n");
        let mut bytes = response.into_bytes();
        bytes.extend_from_slice(&[0, 255, b'a']);
        let (url, server) = response_fixture(bytes).await;
        let mut input = request("GET", None);
        input.headers = vec![
            FetchHeader {
                name: "X-Fixture".into(),
                value: "one".into(),
            },
            FetchHeader {
                name: "X-Fixture".into(),
                value: "two".into(),
            },
        ];
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            send_request(&client, outbound_passthrough_request(&input, url).unwrap()),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(output.status, status);
        assert_eq!(output.status_text, reason);
        assert_eq!(output.body_base64, "AP9h");
        assert_eq!(output.headers.len(), 1);
        let observed = String::from_utf8(server.await.unwrap())
            .unwrap()
            .to_ascii_lowercase();
        assert!(observed.contains("x-fixture: one\r\n"));
        assert!(observed.contains("x-fixture: two\r\n"));
    }
}

#[tokio::test]
async fn real_transport_maps_send_read_and_declared_size_failures() {
    use core_runtime_supervisor::authenticated_fetch::send_request;
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let mut input = request("GET", None);
    input.headers.push(FetchHeader {
        name: "bad header".into(),
        value: "fixture".into(),
    });
    assert_eq!(
        send_request(
            &client,
            outbound_passthrough_request(&input, url()).unwrap()
        )
        .await
        .unwrap_err(),
        "nodeRepl.fetch request failed"
    );
    for (raw, expected) in [
        (
            "HTTP/1.1 200 OK\r\nContent-Length: 10485761\r\nConnection: close\r\n\r\n",
            "nodeRepl.fetch response is too large",
        ),
        (
            "HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\nshort",
            "nodeRepl.fetch response read failed",
        ),
    ] {
        let (url, server) = response_fixture(raw.as_bytes().to_vec()).await;
        assert_eq!(
            send_request(
                &client,
                outbound_passthrough_request(&request("GET", None), url).unwrap()
            )
            .await
            .unwrap_err(),
            expected
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn tls_transport_checks_certificate_trust_and_hostname() {
    use core_runtime_supervisor::authenticated_fetch::{http_client_builder, send_request};
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    struct FixtureDir(std::path::PathBuf);
    impl Drop for FixtureDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    let directory =
        FixtureDir(std::env::temp_dir().join(format!("core-fetch-tls-{}", uuid::Uuid::new_v4())));
    std::fs::create_dir(&directory.0).unwrap();
    let cert = directory.0.join("cert.pem");
    let key = directory.0.join("key.pem");
    let generated = std::process::Command::new("openssl")
        .args([
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "1",
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost",
            "-addext",
            "basicConstraints=critical,CA:FALSE",
            "-addext",
            "extendedKeyUsage=serverAuth",
            "-keyout",
        ])
        .arg(&key)
        .arg("-out")
        .arg(&cert)
        .output()
        .unwrap();
    assert!(
        generated.status.success(),
        "failed to generate owned test certificate"
    );
    let script = r#"
import socket, ssl, sys
ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(sys.argv[1],sys.argv[2])
with socket.socket() as server:
 server.bind(('127.0.0.1',0));server.listen();server.settimeout(10)
 print(server.getsockname()[1],flush=True)
 for _ in range(3):
  conn,_=server.accept();conn.settimeout(5)
  try:
   with ctx.wrap_socket(conn,server_side=True) as tls:
    data=b''
    while b'\r\n\r\n' not in data:
     part=tls.recv(4096)
     if not part:break
     data+=part
    tls.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 7\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nfixture')
  except ssl.SSLError: conn.close()
"#;
    let mut server = tokio::process::Command::new("python3")
        .args(["-u", "-c", script])
        .arg(&cert)
        .arg(&key)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut lines = BufReader::new(server.stdout.take().unwrap()).lines();
    let port = tokio::time::timeout(std::time::Duration::from_secs(5), lines.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let certificate = reqwest::Certificate::from_pem(&std::fs::read(&cert).unwrap()).unwrap();
    for (trusted, hostname, succeeds) in [
        (false, "localhost", false),
        (true, "localhost", true),
        (true, "127.0.0.1", false),
    ] {
        let mut builder = http_client_builder().no_proxy();
        if trusted {
            builder = builder.add_root_certificate(certificate.clone());
        }
        let client = builder.build().unwrap();
        let url = Url::parse(&format!("https://{hostname}:{port}/fixture")).unwrap();
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            send_request(
                &client,
                outbound_passthrough_request(&request("GET", None), url).unwrap(),
            ),
        )
        .await
        .unwrap();
        if succeeds {
            assert_eq!(result.unwrap().body_base64, "Zml4dHVyZQ==");
        } else {
            assert_eq!(result.unwrap_err(), "nodeRepl.fetch request failed");
        }
    }
    assert!(
        tokio::time::timeout(std::time::Duration::from_secs(5), server.wait())
            .await
            .unwrap()
            .unwrap()
            .success()
    );
}
