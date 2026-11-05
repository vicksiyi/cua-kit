fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // Node supplies stable N-API symbols when it loads the addon.
        println!("cargo:rustc-link-arg=-Wl,-undefined,dynamic_lookup");
    }
}
