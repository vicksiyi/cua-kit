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
