use core_browser_extension_host::tab_context_asset::{sanitize_file_name, MAX_FILE_NAME_BYTES};

#[test]
fn native_component_selection_and_reserved_character_mask() {
    assert_eq!(sanitize_file_name(r"C:\folder\report.txt"), "report.txt");
    assert_eq!(sanitize_file_name("/folder/report.txt///"), "report.txt");
    assert_eq!(sanitize_file_name("////\\"), "tab-context.txt");
    assert_eq!(sanitize_file_name("folder/ \u{2003}\t"), "tab-context.txt");
    assert_eq!(sanitize_file_name(" \u{2003}报告.txt\u{2003} "), "报告.txt");
    // Independent instruction oracle: ARM64 x23 mask, plus separate '|' compare.
    for value in 0u8..=127 {
        if value == b'/' || value == b'\\' {
            continue;
        }
        let source = format!("a{}z", char::from(value));
        let replaced =
            (value <= 63 && (0xd400_0424_0000_0000u64 >> value) & 1 == 1) || value == b'|';
        assert_eq!(
            sanitize_file_name(&source),
            if replaced { "a_z".into() } else { source }
        );
    }
}

#[test]
fn byte_limit_preserves_extension_and_never_splits_utf8() {
    let exact = "x".repeat(218);
    assert_eq!(sanitize_file_name(&exact), exact);
    assert_eq!(sanitize_file_name(&"x".repeat(219)), "x".repeat(218));
    assert_eq!(
        sanitize_file_name(&format!("{}.pdf", "x".repeat(300))),
        format!("{}.pdf", "x".repeat(214))
    );
    assert_eq!(
        sanitize_file_name(&format!("{}.txt", "界".repeat(100))),
        format!("{}.txt", "界".repeat(71))
    );
    assert_eq!(
        sanitize_file_name(&format!("{}.png", "🦀".repeat(100))),
        format!("{}.png", "🦀".repeat(53))
    );
    assert_eq!(
        sanitize_file_name(&format!("{}.txt", "a ".repeat(150))),
        format!("{}.txt", "a ".repeat(107).trim_end())
    );
    // An overlong extension and a leading-dot name fall back to a whole-name prefix.
    assert_eq!(
        sanitize_file_name(&format!("a.{}", "x".repeat(300))),
        format!("a.{}", "x".repeat(216))
    );
    assert_eq!(
        sanitize_file_name(&format!(".{}", "x".repeat(300))),
        format!(".{}", "x".repeat(217))
    );
    // A nearly full extension leaves no complete Unicode stem; use fallback.
    let source = format!("🦀.{}", "x".repeat(216));
    assert_eq!(
        sanitize_file_name(&source),
        format!("🦀.{}", "x".repeat(213))
    );
    for width in 1..300 {
        for unit in ["a", "é", "界", "🦀"] {
            let result = sanitize_file_name(&format!("folder/{}.json", unit.repeat(width)));
            assert!(result.len() <= MAX_FILE_NAME_BYTES);
            assert!(result.ends_with(".json"));
            assert!(!result.contains('/'));
        }
    }
}
