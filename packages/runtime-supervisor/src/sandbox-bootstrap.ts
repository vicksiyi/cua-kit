/** Legacy test/reference entry. Production uses the native runtime's Node binding. */
await import(new URL("../../../native/runtime-supervisor/dist/sandbox-bootstrap.js", import.meta.url).href);
export {};
