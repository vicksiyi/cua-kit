//! Native request preparation reconstructed from the pinned node_repl binary.
//! Request routing, shaping and explicit-client HTTP sending; no credential acquisition.
use base64::{engine::general_purpose::STANDARD, Engine};
use http::Method;
use url::Url;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct FetchHeader {
    pub name: String,
    pub value: String,
}

pub struct AuthenticatedFetchRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<FetchHeader>,
    pub body_base64: Option<String>,
}

#[derive(Clone, Debug)]
pub struct OutboundRequest {
    pub method: Method,
    pub url: Url,
    pub headers: Vec<FetchHeader>,
    pub body: Vec<u8>,
}

/// Original outbound_passthrough_request receives an already resolved URL.
/// Method validation precedes body decoding; headers are cloned without validation
/// or normalization here. Authorization/routing is a separate, unfinished layer.
pub fn outbound_passthrough_request(
    request: &AuthenticatedFetchRequest,
    url: Url,
) -> Result<OutboundRequest, &'static str> {
    let method = Method::from_bytes(request.method.as_bytes())
        .map_err(|_| "nodeRepl.fetch method is invalid")?;
    let body = match &request.body_base64 {
        Some(body) => STANDARD
            .decode(body)
            .map_err(|_| "nodeRepl.fetch body is invalid")?,
        None => Vec::new(),
    };
    Ok(OutboundRequest {
        method,
        url,
        headers: request.headers.clone(),
        body,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FetchRuntimeMode {
    Default,
    GaasBrowser,
}

#[derive(Debug)]
pub enum ResolvedRequest {
    Authenticated(OutboundRequest),
    Passthrough(OutboundRequest),
}

/// Resolve the native transport branch; this is not an HTTP sender or approval.
pub fn resolved_request(
    request: &AuthenticatedFetchRequest,
    mode: FetchRuntimeMode,
) -> Result<ResolvedRequest, &'static str> {
    let url = Url::parse(&request.url).map_err(|_| "nodeRepl.fetch URL is invalid")?;
    let gaas = mode == FetchRuntimeMode::GaasBrowser;
    let clean_https = url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none();
    let post = request.method.eq_ignore_ascii_case("POST");
    let post_route = matches!(
        url.path(),
        "/ces/v1/rgstr" | "/backend-api/flora/browser/redeem-otp"
    );
    if gaas {
        let allowed = match url.host_str() {
            Some("chatgpt.com") => {
                matches!(
                    url.path(),
                    "/backend-api/aura/identity"
                        | "/backend-api/aura/site_status"
                        | "/backend-api/browser/site_status"
                ) || (post && post_route)
            }
            Some("chatgpt-staging.com") => matches!(
                url.path(),
                "/backend-api/aura/identity" | "/backend-api/aura/site_status"
            ),
            Some("ab.chatgpt.com") => url.path().starts_with("/v1/") && post,
            Some("o33249.ingest.us.sentry.io") => {
                url.path() == "/api/4511236780326912/envelope/" && post
            }
            _ => false,
        };
        if !clean_https || !allowed {
            return Err("nodeRepl.fetch destination is not allowed in gaas-browser runtime mode");
        }
    }
    let special_host = url.host_str() == Some("chatgpt.com")
        || (gaas && url.host_str() == Some("chatgpt-staging.com"));
    if clean_https && special_host {
        if !(post && post_route) {
            if !request.method.eq_ignore_ascii_case("GET") {
                return Err("nodeRepl.fetch only allows GET for this route");
            }
            if !request.headers.is_empty() {
                return Err("nodeRepl.fetch does not allow caller headers for this route");
            }
            if request
                .body_base64
                .as_ref()
                .is_some_and(|body| !body.is_empty())
            {
                return Err("nodeRepl.fetch does not allow caller bodies for this route");
            }
        }
        let outbound = outbound_passthrough_request(request, url)?;
        return Ok(if gaas {
            ResolvedRequest::Passthrough(outbound)
        } else {
            ResolvedRequest::Authenticated(outbound)
        });
    }
    outbound_passthrough_request(request, url).map(ResolvedRequest::Passthrough)
}

/// Fields consumed by native outbound header shaping. Credential acquisition is
/// a separate App Server responsibility and is not implemented by this type.
pub struct FetchCredentials {
    pub access_token: String,
    pub account_id: Option<String>,
}

/// Preserve unrelated headers in order, replace reserved names case-insensitively,
/// then append the native authorization/originator and optional account headers.
/// This stage does not validate header values; transport validation comes later.
pub fn outbound_authenticated_request(
    mut request: OutboundRequest,
    credentials: FetchCredentials,
) -> OutboundRequest {
    request.headers.retain(|header| {
        !["authorization", "originator", "chatgpt-account-id"]
            .iter()
            .any(|reserved| header.name.eq_ignore_ascii_case(reserved))
    });
    request.headers.push(FetchHeader {
        name: "authorization".into(),
        value: format!("Bearer {}", credentials.access_token),
    });
    request.headers.push(FetchHeader {
        name: "originator".into(),
        value: "codex_browser_use".into(),
    });
    if let Some(account_id) = credentials.account_id {
        request.headers.push(FetchHeader {
            name: "ChatGPT-Account-ID".into(),
            value: account_id,
        });
    }
    request
}

pub const MAX_FETCH_RESPONSE_BYTES: u64 = 10 * 1024 * 1024;

/// Native send checks the transport's decoded content length before reading.
pub fn check_response_content_length(length: Option<u64>) -> Result<(), &'static str> {
    if length.is_some_and(|length| length > MAX_FETCH_RESPONSE_BYTES) {
        Err("nodeRepl.fetch response is too large")
    } else {
        Ok(())
    }
}

#[derive(Debug, serde::Serialize)]
pub struct FetchResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<FetchHeader>,
    pub body_base64: String,
}

/// Native response projection after body collection. This is not an HTTP sender.
/// Only the first content-type value is exposed, if HeaderValue::to_str accepts it.
pub fn finish_response(
    status: http::StatusCode,
    headers: &http::HeaderMap,
    body: &[u8],
) -> Result<FetchResponse, &'static str> {
    check_response_content_length(Some(body.len() as u64))?;
    let headers = headers
        .get(http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| {
            vec![FetchHeader {
                name: "content-type".into(),
                value: value.into(),
            }]
        })
        .unwrap_or_default();
    Ok(FetchResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        headers,
        body_base64: STANDARD.encode(body),
    })
}

/// Send using an explicitly supplied client. Client construction (TLS and other
/// compiled features) and credential acquisition remain deployment concerns.
/// No default client is installed into the production host by this function.
pub async fn send_request(
    client: &reqwest::Client,
    request: OutboundRequest,
) -> Result<FetchResponse, &'static str> {
    let mut builder = client
        .request(request.method, request.url)
        .body(request.body);
    for header in request.headers {
        builder = builder.header(header.name, header.value);
    }
    let response = builder
        .send()
        .await
        .map_err(|_| "nodeRepl.fetch request failed")?;
    check_response_content_length(response.content_length())?;
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .bytes()
        .await
        .map_err(|_| "nodeRepl.fetch response read failed")?;
    finish_response(status, &headers, &body)
}

/// Evidenced native client options. Keep proxy/root discovery delegated to
/// reqwest; callers may add owned test roots before building.
pub fn http_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
}

pub fn build_http_client() -> Result<reqwest::Client, &'static str> {
    http_client_builder()
        .build()
        .map_err(|_| "failed to initialize nodeRepl.fetch HTTP client")
}

pub type FetchFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, String>> + Send + 'a>>;

/// Native auth boundary: acquisition/cache/refresh belong to the provider.
pub trait FetchAuthProvider: Send + Sync {
    fn current_auth(&self) -> FetchFuture<'_, FetchCredentials>;
    fn refetch_auth(&self) -> FetchFuture<'_, FetchCredentials>;
}

pub trait FetchHttpClient: Send + Sync {
    fn send(&self, request: OutboundRequest) -> FetchFuture<'_, FetchResponse>;
}

impl FetchHttpClient for reqwest::Client {
    fn send(&self, request: OutboundRequest) -> FetchFuture<'_, FetchResponse> {
        Box::pin(async move { send_request(self, request).await.map_err(str::to_owned) })
    }
}

/// Resolve before auth acquisition. Only authenticated 401 responses trigger one
/// credential refetch and one resend; transport errors and passthrough never do.
pub async fn fetch_with_auth(
    request: &AuthenticatedFetchRequest,
    mode: FetchRuntimeMode,
    auth: &dyn FetchAuthProvider,
    http: &dyn FetchHttpClient,
) -> Result<FetchResponse, String> {
    match resolved_request(request, mode).map_err(str::to_owned)? {
        ResolvedRequest::Passthrough(request) => http.send(request).await,
        ResolvedRequest::Authenticated(request) => {
            let credentials = auth.current_auth().await?;
            let response = http
                .send(outbound_authenticated_request(request.clone(), credentials))
                .await?;
            if response.status != 401 {
                return Ok(response);
            }
            let credentials = auth.refetch_auth().await?;
            http.send(outbound_authenticated_request(request, credentials))
                .await
        }
    }
}
