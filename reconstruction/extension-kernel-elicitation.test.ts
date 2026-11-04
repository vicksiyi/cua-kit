import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createKernelElicitation,
  isKernelObjectSchema,
  isKernelPropertySchema,
} from "../packages/browser-extension/src/kernel_elicitation";

test("kernel elicitation schema guards retain bundled permissive boundaries", () => {
  const original = extensionBindings(["Lt", "yl", "Sl"], {});
  const values: any[] = [
    null,
    [],
    {},
    { type: "object" },
    { type: "object", properties: {} },
    { type: "object", properties: {}, required: [1] },
    {
      type: "object",
      properties: {},
      required: ["missing"],
      additionalProperties: false,
    },
    { type: "object", properties: {}, additionalProperties: {} },
    { type: "array", items: { type: "string" } },
    { type: "array" },
    { type: "null", enum: "ignored" },
    Object.create({ type: "string" }),
  ];
  for (const type of ["string", "number", "integer", "boolean", "unknown"])
    for (const enumeration of [
      undefined,
      [],
      [1],
      [1.5, NaN, Infinity],
      ["x"],
      [true],
      null,
      "x",
    ])
      values.push({ type, enum: enumeration });
  for (const value of values) {
    assert.equal(isKernelPropertySchema(value), original.Sl(value));
    assert.equal(isKernelObjectSchema(value), original.yl(value));
    assert.equal(
      isKernelObjectSchema({ type: "object", properties: { nested: value } }),
      original.yl({ type: "object", properties: { nested: value } }),
    );
  }
});

test("kernel elicitation forwards original schema/meta/signal and preserves response validation", async () => {
  for (const mode of [
    "default",
    "null-schema",
    "schema",
    "bad-schema",
    "null-meta",
    "null-content",
    "content",
    "array-content",
    "array-meta",
    "primitive-content",
    "reject",
    "no-scope",
    "abort-during",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const abort = new AbortController();
      const schema = {
        type: "object",
        properties: { answer: { type: "string" } },
      };
      const getScope = (id: string) => {
        trace.push(["scope", id]);
        if (mode === "no-scope") throw Error("scope missing");
        return {
          signal: abort.signal,
          client: {
            async createElicitation(request: any, signal: AbortSignal) {
              assert.equal(signal, abort.signal);
              if (mode === "schema")
                assert.equal(request.requestedSchema, schema);
              trace.push(["request", request]);
              if (mode === "reject") throw Error("host failure");
              if (mode === "abort-during") abort.abort("later");
              return {
                action: "accept",
                ...(mode === "null-content"
                  ? { content: null, _meta: null }
                  : mode === "content"
                    ? { content: { answer: "yes" }, _meta: { trace: "id" } }
                    : mode === "array-content"
                      ? { content: [] }
                      : mode === "array-meta"
                        ? { _meta: [] }
                        : mode === "primitive-content"
                          ? { content: 1 }
                          : {}),
              };
            },
          },
        };
      };
      const Source = extensionBindings(["Ds", "Lt", "yl", "Sl"], {
        Le: getScope,
      }).Ds;
      const source = new Source("scope");
      const run = restored
        ? createKernelElicitation("scope", getScope)
        : source.createElicitation.bind(source);
      const request = {
        message: "confirm",
        requestedSchema:
          mode === "schema"
            ? schema
            : mode === "bad-schema"
              ? {}
              : mode === "null-schema"
                ? null
                : undefined,
        meta: mode === "null-meta" ? null : { trace: "request" },
      };
      let result;
      try {
        result = await run(request);
      } catch (error: any) {
        result = { error: error.message };
      }
      outputs.push({ trace, result });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
