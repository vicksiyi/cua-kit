//! Native App Server authentication helpers reconstructed from pinned instructions.
//! This is metadata extraction, NOT JWT verification or an authorization decision.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;

/// Read a string claim in the ChatGPT auth namespace from the second token segment.
/// Matches the native helper: header, signature, expiry and segment count are not
/// validated. Only the payload encoding/JSON and the requested string are checked.
/// Never use this result as proof that a token is trusted.
pub fn chatgpt_auth_claim_from_token(token: &str, claim: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    value
        .get("https://api.openai.com/auth")?
        .get(claim)?
        .as_str()
        .map(str::to_owned)
}

/// JSON-RPC method sent by the native App Server access-token fetcher.
pub const AUTH_STATUS_METHOD: &str = "getAuthStatus";

/// Parameters only; request IDs and transport envelopes belong to App Server.
pub fn auth_status_params(refresh_token: bool) -> Value {
    serde_json::json!({"includeToken": true, "refreshToken": refresh_token})
}

/// Parse the successful RPC result, preserving the native validation order.
/// RPC/transport errors are handled upstream, before this result parser.
pub fn access_token_from_auth_status(result: &Value) -> Result<String, String> {
    let token = result
        .get("authToken")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Codex auth token is unavailable".to_owned())?;
    let method = result
        .get("authMethod")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex auth method is unavailable".to_owned())?;
    if method != "chatgpt" {
        return Err(format!("unsupported Codex auth method: {method}"));
    }
    Ok(token.to_owned())
}

/// Fields observed in the native CodexAuth result. Deliberately no Debug or
/// Serialize implementation: callers must not accidentally log the access token.
pub struct CodexAuth {
    pub access_token: String,
    pub account_id: Option<String>,
    pub user_id: Option<String>,
}

impl CodexAuth {
    /// The native provider extracts account then user metadata from the returned
    /// access token. Missing claims do not invalidate the token here.
    pub fn from_access_token(access_token: String) -> Self {
        let account_id = chatgpt_auth_claim_from_token(&access_token, "chatgpt_account_id");
        let user_id = chatgpt_auth_claim_from_token(&access_token, "chatgpt_user_id");
        Self {
            access_token,
            account_id,
            user_id,
        }
    }

    pub fn into_fetch_credentials(self) -> crate::authenticated_fetch::FetchCredentials {
        crate::authenticated_fetch::FetchCredentials {
            access_token: self.access_token,
            account_id: self.account_id,
        }
    }
}
