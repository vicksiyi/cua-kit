//! Test-only framed stdio echo. Not an installed Native Messaging host.
use core_browser_extension_host::transport::{encode, receive};
use std::io::{self, Write};
fn run() -> io::Result<()> {
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    while let Some(message) = receive(&mut input, 1024 * 1024)? {
        output.write_all(&encode(&message, 1024 * 1024)?)?;
        output.flush()?;
    }
    Ok(())
}
fn main() {
    if run().is_err() {
        eprintln!("native frame transport failed");
        std::process::exit(1);
    }
}
