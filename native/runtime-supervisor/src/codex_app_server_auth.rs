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
