// Explicit provider entry; generic demo allows other compatible providers.
process.env.CUA_MODEL_PROVIDER = "deepseek";
await import("./run-demo.mjs");
