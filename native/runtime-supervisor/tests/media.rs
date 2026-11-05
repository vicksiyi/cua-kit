use base64::{engine::general_purpose::STANDARD, Engine};
use core_runtime_supervisor::media::decode_media_message;
use serde_json::{json, Value};
#[test]
fn binary_percent_data_queries_and_operation_types() {
    assert_eq!(
        decode_media_message(
            &json!({"type":"emit_image","image_url":"data:image/png,%89PNG%0D%0A%1A%0A"})
        )
        .unwrap(),
        json!({"type":"image","mimeType":"image/png","data":"iVBORw0KGgo="})
    );
    assert_eq!(
        decode_media_message(
            &json!({"type":"emit_audio","audio_url":"data:audio/wav,%00%FF?query#ignored"})
        )
        .unwrap()["data"],
        STANDARD.encode([&[0u8, 255][..], b"?query"].concat())
    );
    assert!(decode_media_message(
        &json!({"type":"emit_audio","audio_url":"data:image/png;base64,AA=="})
    )
    .is_err());
    assert!(decode_media_message(&json!({"type":"emit_image","image_url":format!("data:image/png,{}","a".repeat(6*1024*1024+1))})).is_err());
    assert!(decode_media_message(&json!({"type":"emit_image","image_url":format!("data:image/png,{}","a".repeat(8*1024*1024))})).is_err());
}
#[test]
fn compares_envelopes_with_existing_typescript_adapter() {
    let urls = vec![
        "data:image/png;base64,AA==",
        "data:image/png;base64,AB==",
        "data:image/png;base64,Zg",
        "data:image/png;base64,Zg=",
        "data:image/png;base64,Zg===",
        "data:image/png;base64, Z g == ",
        "data:IMAGE/PNG;charset=x;BASE64,%41%41%3D%3D",
        "data:image/png;base64,",
        "data:image/png;base64,!!!!",
        "data:image/png;base64,A",
        "data:image/png;base64,AAAA#ignore",
        "data:image/png;base64,AAAA?query",
        "data:image/png,%00%FF?query#ignore",
        "data:image/png,%GG",
        "data:image/png;param=x,abc",
        "data:image/png; base64,AA==",
        "data:image/png;base64 ,AA==",
        "data:image/png,hello world",
        "data:image/png,你好",
        "data:image/png,",
        "data:,abc",
        "data:text/plain;base64,AA==",
        "file:///tmp/not-read",
        "https://example.invalid/not-requested",
    ];
    let messages: Vec<Value> = urls
        .into_iter()
        .map(|url| json!({"type":"emit_image","image_url":url}))
        .collect();
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let script=format!("import {{decodeMediaMessage}} from './packages/runtime-supervisor/src/media.ts'; const values={};const results=[];for(const value of values){{try{{results.push({{ok:true,value:await decodeMediaMessage(value)}})}}catch{{results.push({{ok:false}})}}}}console.log(JSON.stringify(results));",serde_json::to_string(&messages).unwrap());
    let output =
        std::process::Command::new(std::env::var("CUA_TEST_NODE").expect("Set CUA_TEST_NODE"))
            .current_dir(root)
            .args(["--import", "tsx", "--input-type=module", "-e", &script])
            .output()
            .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let expected: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for (message, expected) in messages.iter().zip(expected) {
        let actual = match decode_media_message(message) {
            Ok(value) => json!({"ok":true,"value":value}),
            Err(_) => json!({"ok":false}),
        };
        assert_eq!(actual, expected, "{message}");
    }
}

#[test]
fn audio_budget_accepts_full_contract_but_remains_bounded() {
    use core_runtime_supervisor::limits::{MAX_AUDIO_BYTES, MAX_AUDIO_URL_BYTES, MAX_EXECUTION_CONTENT_BYTES, MAX_WORKER_FRAME_BYTES};
    // 300 seconds, 24 kHz, stereo PCM16 plus ordinary WAV header space.
    let pcm = vec![0_u8; 300 * 24000 * 2 * 2 + 4096];
    let encoded = STANDARD.encode(&pcm);
    let message = json!({"type":"emit_audio","audio_url":format!("data:audio/wav;base64,{encoded}")});
    assert!(serde_json::to_vec(&message).unwrap().len() < MAX_WORKER_FRAME_BYTES);
    let result = decode_media_message(&message).unwrap();
    assert_eq!(result["data"].as_str().unwrap(), encoded);
    assert!(serde_json::to_vec(&result).unwrap().len() < MAX_EXECUTION_CONTENT_BYTES);
    assert!(decode_media_message(&json!({"type":"emit_audio","audio_url":format!("data:audio/wav,{}","a".repeat(MAX_AUDIO_BYTES+1))})).is_err());
    assert!(decode_media_message(&json!({"type":"emit_audio","audio_url":"a".repeat(MAX_AUDIO_URL_BYTES+1)})).is_err());
}
