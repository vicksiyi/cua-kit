//! Reconstructed native attachment filename handling.
//! Evidence: installed ARM64 host (2a5b1035...), create_tab_context_asset
//! 0x100016270..0x1000164f0 and sanitizer map 0x100029c24..0x100029ea8.
//! This module is not yet wired to the native control dispatcher.

pub const MAX_ACTIVE_ASSETS: usize = 16;
pub const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;
pub const MAX_FILE_NAME_BYTES: usize = 218;
const DEFAULT_FILE_NAME: &str = "tab-context.txt";

fn prefix_at_char_boundary(value: &str, max_bytes: usize) -> &str {
    let mut end = value.len().min(max_bytes);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

/// The native sanitizer works on UTF-8 bytes, not character count. It takes the
/// last nonempty slash/backslash component, replaces the observed reserved
/// characters, trims whitespace, and preserves the final extension when it fits.
/// Do not use this function alone as path authorization: the original host
/// subsequently prefixes the generated UUID to the name.
pub fn sanitize_file_name(input: &str) -> String {
    let component = input
        .rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(DEFAULT_FILE_NAME);
    let replaced: String = component
        .chars()
        .map(|ch| match ch {
            '"' | '%' | '*' | ':' | '<' | '>' | '?' | '|' => '_',
            _ => ch,
        })
        .collect();
    let name = replaced.trim();
    if name.is_empty() {
        return DEFAULT_FILE_NAME.to_owned();
    }
    if name.len() <= MAX_FILE_NAME_BYTES {
        return name.to_owned();
    }
    if let Some(dot) = name.rfind('.') {
        let extension = &name[dot..];
        if dot != 0 && extension.len() < MAX_FILE_NAME_BYTES {
            let stem = prefix_at_char_boundary(&name[..dot], MAX_FILE_NAME_BYTES - extension.len())
                .trim_end();
            if !stem.is_empty() {
                return format!("{stem}{extension}");
            }
        }
    }
    prefix_at_char_boundary(name, MAX_FILE_NAME_BYTES)
        .trim()
        .to_owned()
}
