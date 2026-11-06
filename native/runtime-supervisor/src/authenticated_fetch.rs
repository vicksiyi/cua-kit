//! Native request preparation reconstructed from the pinned node_repl binary.
//! This module does not resolve authorization, select destinations or send HTTP.
use base64::{engine::general_purpose::STANDARD, Engine};
use http::Method;
use url::Url;

#[derive(Clone, Debug, PartialEq, Eq)]
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

#[derive(Debug)]
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
