//! Independent Rust Seatbelt bridge. Stable Node N-API ABI only; no Node headers.
//! Caller supplies a trusted profile before importing worker code.
#![cfg(target_os = "macos")]
use std::ffi::{c_char, c_int, c_void, CStr};
use std::ptr::{null, null_mut};
type Env = *mut c_void;
type Value = *mut c_void;
type CallbackInfo = *mut c_void;
type Status = c_int;
extern "C" {
    fn napi_get_cb_info(
        env: Env,
        info: CallbackInfo,
        argc: *mut usize,
        argv: *mut Value,
        this: *mut Value,
        data: *mut *mut c_void,
    ) -> Status;
    fn napi_get_value_string_utf8(
        env: Env,
        value: Value,
        buf: *mut c_char,
        size: usize,
        result: *mut usize,
    ) -> Status;
    fn napi_throw_error(env: Env, code: *const c_char, message: *const c_char) -> Status;
    fn napi_get_undefined(env: Env, result: *mut Value) -> Status;
    fn napi_create_function(
        env: Env,
        name: *const c_char,
        length: usize,
        callback: Option<unsafe extern "C" fn(Env, CallbackInfo) -> Value>,
        data: *mut c_void,
        result: *mut Value,
    ) -> Status;
    fn napi_set_named_property(
        env: Env,
        object: Value,
        name: *const c_char,
        value: Value,
    ) -> Status;
}
#[link(name = "sandbox")]
extern "C" {
    fn sandbox_init(profile: *const c_char, flags: u64, error: *mut *mut c_char) -> c_int;
    fn sandbox_free_error(error: *mut c_char);
}
unsafe fn fail(env: Env, message: &CStr) -> Value {
    napi_throw_error(env, null(), message.as_ptr());
    null_mut()
}
unsafe extern "C" fn apply(env: Env, info: CallbackInfo) -> Value {
    let mut argc = 2;
    let mut args = [null_mut(); 2];
    let mut length = 0;
    if napi_get_cb_info(
        env,
        info,
        &mut argc,
        args.as_mut_ptr(),
        null_mut(),
        null_mut(),
    ) != 0
        || argc != 1
        || napi_get_value_string_utf8(env, args[0], null_mut(), 0, &mut length) != 0
        || length == 0
        || length > 1024 * 1024
    {
        return fail(env, c"Expected one nonempty sandbox profile up to 1 MiB");
    }
    let mut profile = vec![0u8; length + 1];
    let mut copied = 0;
    if napi_get_value_string_utf8(
        env,
        args[0],
        profile.as_mut_ptr().cast(),
        profile.len(),
        &mut copied,
    ) != 0
        || copied != length
        || profile[..length].contains(&0)
    {
        return fail(env, c"Invalid sandbox profile string");
    }
    let mut error = null_mut();
    let result = sandbox_init(profile.as_ptr().cast(), 0, &mut error);
    if result != 0 {
        // Error memory is owned by libSystem sandbox; napi copies the text.
        let value = if error.is_null() {
            fail(env, c"Cannot apply sandbox profile")
        } else {
            fail(env, CStr::from_ptr(error))
        };
        if !error.is_null() {
            sandbox_free_error(error);
        }
        return value;
    }
    if !error.is_null() {
        sandbox_free_error(error);
    }
    let mut value = null_mut();
    if napi_get_undefined(env, &mut value) != 0 {
        return fail(env, c"Cannot produce sandbox result");
    }
    value
}
#[no_mangle]
pub unsafe extern "C" fn napi_register_module_v1(env: Env, exports: Value) -> Value {
    let mut function = null_mut();
    if napi_create_function(
        env,
        c"apply".as_ptr(),
        5,
        Some(apply),
        null_mut(),
        &mut function,
    ) != 0
        || napi_set_named_property(env, exports, c"apply".as_ptr(), function) != 0
    {
        return fail(env, c"Cannot initialize sandbox bridge");
    }
    exports
}
#[no_mangle]
pub extern "C" fn node_api_module_get_api_version_v1() -> c_int {
    8
}
