//! Incremental KernelToHost payload reconstruction from the pinned native visitor.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize, Serialize)]
struct ExecResult {
    #[serde(rename = "type")]
    kind: String,
    id: String,
    ok: bool,
    output: String,
    #[serde(default)]
    named_outputs: Vec<String>,
    #[serde(default)]
    content_items: Vec<String>,
    error: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_error_kind",
        skip_serializing_if = "Option::is_none"
    )]
    error_kind: Option<String>,
}
// Original deserialize_error_kind reads arbitrary JSON: a string is preserved;
// every present non-string value, including null, becomes Some("unknown").
fn deserialize_error_kind<'de, D: serde::Deserializer<'de>>(
    input: D,
) -> Result<Option<String>, D::Error> {
    Ok(Some(match Value::deserialize(input)? {
        Value::String(value) => value,
        _ => "unknown".into(),
    }))
}
pub(crate) fn decode_exec_result(line: &[u8]) -> Result<Value, serde_json::Error> {
    serde_json::to_value(serde_json::from_slice::<ExecResult>(line)?)
}

// Both native timeout variants share ExecTimeoutControlMessage, whose sole
// payload field is required exec_id:String (visitor 0x100038f50..0x100039728).
#[derive(Deserialize, Serialize)]
struct ExecTimeoutControl {
    #[serde(rename = "type")]
    kind: String,
    exec_id: String,
}
pub(crate) fn decode_timeout_control(line: &[u8]) -> Result<Value, serde_json::Error> {
    serde_json::to_value(serde_json::from_slice::<ExecTimeoutControl>(line)?)
}

// Native SubmittedCodeCompleteMessage visitor: required identity and optional u64.
#[derive(Deserialize, Serialize)]
struct SubmittedCodeComplete {
    #[serde(rename = "type")]
    kind: String,
    exec_id: String,
    execution_duration_ms: Option<u64>,
}
pub(crate) fn decode_submitted_code_complete(line: &[u8]) -> Result<Value, serde_json::Error> {
    serde_json::to_value(serde_json::from_slice::<SubmittedCodeComplete>(line)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn submitted_completion_identity_and_duration_match_native_types() {
        let prefix = r#"{"type":"submitted_code_complete","exec_id":"""#;
        for suffix in [
            "}",
            ",\"execution_duration_ms\":null}",
            ",\"execution_duration_ms\":0}",
            ",\"execution_duration_ms\":18446744073709551615}",
        ] {
            assert!(decode_submitted_code_complete(format!("{prefix}{suffix}").as_bytes()).is_ok());
        }
        for value in [
            "-1",
            "1.5",
            "18446744073709551616",
            "true",
            "\"1\"",
            "[]",
            "{}",
        ] {
            assert!(
                decode_submitted_code_complete(
                    format!("{prefix},\"execution_duration_ms\":{value}}}").as_bytes()
                )
                .is_err(),
                "{value}"
            );
        }
        for raw in [
            r#"{"type":"submitted_code_complete"}"#,
            r#"{"type":"submitted_code_complete","exec_id":null}"#,
            r#"{"type":"submitted_code_complete","exec_id":"one","exec_id":"two"}"#,
            r#"{"type":"submitted_code_complete","exec_id":"one","execution_duration_ms":null,"execution_duration_ms":0}"#,
        ] {
            assert!(decode_submitted_code_complete(raw.as_bytes()).is_err());
        }
        let value =
            decode_submitted_code_complete(format!("{prefix},\"unknown\":1}}").as_bytes()).unwrap();
        assert!(value.get("unknown").is_none());
        assert!(value["execution_duration_ms"].is_null());
    }
    #[test]
    fn timeout_control_requires_one_string_identity_and_ignores_unknown_fields() {
        for kind in ["suspend_timeout", "resume_timeout"] {
            for identity in ["", "execution"] {
                let raw = json!({"type":kind,"exec_id":identity,"extra":{"value":1}});
                assert_eq!(
                    decode_timeout_control(&serde_json::to_vec(&raw).unwrap()).unwrap(),
                    json!({"type":kind,"exec_id":identity})
                );
            }
            for value in [Value::Null, json!(42), json!(false), json!([]), json!({})] {
                let raw = json!({"type":kind,"exec_id":value});
                assert!(decode_timeout_control(&serde_json::to_vec(&raw).unwrap()).is_err());
            }
            assert!(decode_timeout_control(format!(r#"{{"type":"{kind}"}}"#).as_bytes()).is_err());
            assert!(decode_timeout_control(
                format!(r#"{{"type":"{kind}","exec_id":"first","exec_id":"last"}}"#).as_bytes()
            )
            .is_err());
        }
    }
    #[test]
    fn exec_result_required_fields_defaults_and_types() {
        let base = json!({"type":"exec_result","id":"","ok":false,"output":""});
        let result = decode_exec_result(&serde_json::to_vec(&base).unwrap()).unwrap();
        assert_eq!(result["named_outputs"], json!([]));
        assert_eq!(result["content_items"], json!([]));
        assert_eq!(result["error"], Value::Null);
        assert!(result.get("error_kind").is_none());
        for field in ["id", "ok", "output"] {
            let mut bad = base.clone();
            bad.as_object_mut().unwrap().remove(field);
            assert!(decode_exec_result(&serde_json::to_vec(&bad).unwrap()).is_err());
        }
        for (field, value) in [
            ("id", json!(1)),
            ("ok", json!("true")),
            ("output", Value::Null),
            ("named_outputs", Value::Null),
            ("content_items", json!([{}])),
            ("error", json!({})),
        ] {
            let mut bad = base.clone();
            bad[field] = value;
            assert!(
                decode_exec_result(&serde_json::to_vec(&bad).unwrap()).is_err(),
                "{field}"
            );
        }
    }
    #[test]
    fn exec_result_rejects_duplicate_known_fields_and_ignores_unknown_fields() {
        let base = r#"{"type":"exec_result","id":"one","ok":true,"output":"""#;
        for (field, value) in [
            ("id", json!("two")),
            ("ok", json!(false)),
            ("output", json!("text")),
            ("error", Value::Null),
            ("error_kind", Value::Null),
            ("named_outputs", json!([])),
            ("content_items", json!([])),
        ] {
            let raw = if ["id", "ok", "output"].contains(&field) {
                format!("{base},\"{field}\":{value}}}")
            } else {
                format!("{base},\"{field}\":{value},\"{field}\":{value}}}")
            };
            assert!(decode_exec_result(raw.as_bytes()).is_err(), "{field}");
        }
        let raw = format!("{base},\"extra\":1,\"extra\":2}}");
        assert!(decode_exec_result(raw.as_bytes())
            .unwrap()
            .get("extra")
            .is_none());
    }
    #[test]
    fn exec_result_error_kind_distinguishes_absent_from_present_nonstring() {
        for value in [
            Value::Null,
            json!(true),
            json!([]),
            json!({}),
            json!(42),
            json!(""),
            json!("policy"),
        ] {
            let raw =
                json!({"type":"exec_result","id":"one","ok":false,"output":"","error_kind":value});
            let result = decode_exec_result(&serde_json::to_vec(&raw).unwrap()).unwrap();
            assert_eq!(
                result["error_kind"],
                if value.is_string() {
                    value
                } else {
                    json!("unknown")
                }
            );
        }
    }
}
