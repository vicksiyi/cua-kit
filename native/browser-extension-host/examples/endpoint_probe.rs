//! Owned-fixture integration probe. Not a production Native Messaging executable.
#[cfg(unix)]
fn main() -> std::io::Result<()> {
    use core_browser_extension_host::{
        endpoint::OwnedEndpoint,
        transport::{encode, receive},
    };
    use serde_json::json;
    use std::{io::Write, path::PathBuf, time::Duration};
    let parent = PathBuf::from(std::env::args().nth(1).expect("fixture parent required"));
    let endpoint = OwnedEndpoint::bind(&parent)?;
    println!("{}", endpoint.descriptor_path().display());
    std::io::stdout().flush()?;
    loop {
        let (mut stream, _) = endpoint.listener().accept()?;
        if endpoint
            .authenticate(&mut stream, Duration::from_millis(500))
            .is_err()
        {
            continue;
        }
        let Some(request) = receive(&mut stream, 1024 * 1024)? else {
            continue;
        };
        stream.write_all(&encode(
            &json!({"jsonrpc":"2.0","id":request["id"],"result":request["params"]}),
            1024 * 1024,
        )?)?;
        break;
    }
    Ok(())
}
#[cfg(not(unix))]
fn main() {
    panic!("Unix fixture only");
}
