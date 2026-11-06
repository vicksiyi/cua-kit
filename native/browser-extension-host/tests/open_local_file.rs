use core_browser_extension_host::open_local_file::validate;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
};
use uuid::Uuid;

#[test]
fn native_file_validation_rejects_symlinks_executables_and_nonfiles() {
    let root = std::env::temp_dir().join(format!("core-open-test-{}", Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let run = || {
        assert_eq!(
            validate("relative.txt").unwrap_err().to_string(),
            "Local file path must be absolute"
        );
        assert_eq!(
            validate("/a\0b").unwrap_err().to_string(),
            "Invalid local file path"
        );
        assert!(validate(root.to_str().unwrap()).is_err());
        assert!(validate(root.join("absent").to_str().unwrap()).is_err());
        let plain = root.join("literal ; $(not-executed).txt");
        fs::write(&plain, b"owned test fixture").unwrap();
        fs::set_permissions(&plain, fs::Permissions::from_mode(0o600)).unwrap();
        validate(plain.to_str().unwrap()).unwrap();
        let link = root.join("linked.txt");
        symlink(&plain, &link).unwrap();
        assert_eq!(
            validate(link.to_str().unwrap()).unwrap_err().to_string(),
            "Opening symbolic links is not supported"
        );
        for mode in [0o700, 0o610, 0o601] {
            fs::set_permissions(&plain, fs::Permissions::from_mode(mode)).unwrap();
            assert_eq!(
                validate(plain.to_str().unwrap()).unwrap_err().to_string(),
                "Opening executable files is not supported"
            );
        }
        for extension in ["command", "DESKTOP", "Jar", "terminal", "ToOl"] {
            let file = root.join(format!("fixture.{extension}"));
            fs::write(&file, b"fixture").unwrap();
            fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
            assert_eq!(
                validate(file.to_str().unwrap()).unwrap_err().to_string(),
                "Opening executable files is not supported"
            );
        }
    };
    let outcome = std::panic::catch_unwind(run);
    fs::remove_dir_all(root).unwrap();
    outcome.unwrap();
}
