//! Data-URL media envelope conversion. This performs no network/file fetching
//! and is not an image/audio codec validator.
use base64::{
    alphabet,
    engine::{
        general_purpose::{GeneralPurpose, GeneralPurposeConfig, STANDARD},
        DecodePaddingMode,
    },
    Engine,
};
use percent_encoding::percent_decode_str;
use serde_json::{json, Value};
use url::Url;
const MAX_URL: usize = 8 * 1024 * 1024;
const MAX_BYTES: usize = 6 * 1024 * 1024;
pub fn decode_media_message(message: &Value) -> Result<Value, String> {
    let (kind, key) = match message["type"].as_str() {
        Some("emit_image") => ("image", "image_url"),
        Some("emit_audio") => ("audio", "audio_url"),
        _ => return Err("Unsupported media operation".into()),
    };
    let value = message[key]
        .as_str()
        .ok_or("Media requires a bounded data URL")?;
    if value.len() > MAX_URL
        || !value
            .get(..5)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
    {
        return Err("Media requires a bounded data URL".into());
    }
    let mut url = Url::parse(value).map_err(|_| "Invalid media URL")?;
    if url.scheme() != "data" {
        return Err("Only data media URLs are supported".into());
    }
    url.set_fragment(None);
    // Include opaque URL query bytes; URL.path() alone would drop '?' content.
    let (metadata, payload) = url.as_str()[5..]
        .split_once(',')
        .ok_or("Invalid data URL")?;
    let metadata = metadata.trim_matches(|c: char| c.is_ascii_whitespace());
    let mime = metadata
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let prefix = format!("{kind}/");
    if !mime.starts_with(&prefix)
        || mime.len() == prefix.len()
        || !mime[prefix.len()..].bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b".+-".contains(&byte)
        })
    {
        return Err("Media MIME type does not match operation".into());
    }
    let decoded = percent_decode_str(payload).collect::<Vec<u8>>();
    let bytes = if metadata
        .rsplit_once(';')
        .is_some_and(|(_, flag)| flag.trim_start_matches(' ').eq_ignore_ascii_case("base64"))
    {
        // WHATWG data URLs use forgiving base64: ASCII whitespace and optional padding.
        let mut compact = decoded
            .into_iter()
            .filter(|byte| !matches!(*byte, b'\t' | b'\n' | b'\x0c' | b'\r' | b' '))
            .collect::<Vec<_>>();
        if compact.len() % 4 == 0 {
            if compact.last() == Some(&b'=') {
                compact.pop();
            }
            if compact.last() == Some(&b'=') {
                compact.pop();
            }
        }
        if compact.len() % 4 == 1 || compact.contains(&b'=') {
            return Err("Invalid media base64".into());
        }
        let decoder = GeneralPurpose::new(
            &alphabet::STANDARD,
            GeneralPurposeConfig::new()
                .with_decode_padding_mode(DecodePaddingMode::Indifferent)
                .with_decode_allow_trailing_bits(true),
        );
        decoder
            .decode(compact)
            .map_err(|_| "Invalid media base64")?
    } else {
        decoded
    };
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("Empty or oversized media payload".into());
    }
    Ok(json!({"type":kind,"mimeType":mime,"data":STANDARD.encode(bytes)}))
}
