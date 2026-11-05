/* Independently authored N-API bridge. Applies the host profile before untrusted worker code. */
#include <node_api.h>
#include <sandbox.h>
#include <stdlib.h>
#include <string.h>

static napi_value apply(napi_env env, napi_callback_info info) {
  size_t argc = 1, length = 0;
  napi_value args[1];
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc != 1 ||
      napi_get_value_string_utf8(env, args[0], NULL, 0, &length) != napi_ok ||
      length == 0 || length > 1048576) {
    napi_throw_error(env, NULL, "Expected a nonempty sandbox profile up to 1 MiB");
    return NULL;
  }
  char *profile = malloc(length + 1);
  if (!profile) { napi_throw_error(env, NULL, "Cannot allocate sandbox profile"); return NULL; }
  size_t copied = 0;
  if (napi_get_value_string_utf8(env, args[0], profile, length + 1, &copied) != napi_ok ||
      copied != length || memchr(profile, '\0', length)) {
    free(profile); napi_throw_error(env, NULL, "Invalid sandbox profile string"); return NULL;
  }
  char *failure = NULL;
  int result = sandbox_init(profile, 0, &failure);
  free(profile);
  if (result != 0) {
    napi_throw_error(env, NULL, failure ? failure : "Cannot apply sandbox profile");
    if (failure) sandbox_free_error(failure);
    return NULL;
  }
  napi_value value;
  napi_get_undefined(env, &value);
  return value;
}
static napi_value initialize(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "apply", NAPI_AUTO_LENGTH, apply, NULL, &fn);
  napi_set_named_property(env, exports, "apply", fn);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
