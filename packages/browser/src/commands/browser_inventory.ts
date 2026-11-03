import { z } from "../vendor/bundled_zod";
import { Command } from "./command";

// Original bundle Jt/Gt/Ht/Yt/Xt/Qt. File grouping is reconstructed: original
// source paths are not available for modules flattened into browser-client.js.
const CapabilitySchema = z.object({ id: z.string(), description: z.string() });
const CapabilitiesSchema = z.object({
  browser: z.array(CapabilitySchema).optional(),
  tab: z.array(CapabilitySchema).optional(),
});
const BrowserTypeSchema = z.enum(["iab", "extension", "cdp", "mcpapps"]);
const BrowserFamilySchema = z.string().trim().min(1);
const BrowserInfoSchema = z.object({
  family: BrowserFamilySchema.optional(),
  id: z.string(),
  name: z.string(),
  type: BrowserTypeSchema,
  profileName: z.string().optional(),
  metadata: z
    .object({
      extensionInstanceId: z.string().optional(),
      codexSessionId: z.string().optional(),
    })
    .optional(),
});
const BrowserSchema = BrowserInfoSchema.extend({
  apiSupportOverrides: z.record(z.boolean()).optional(),
  capabilities: CapabilitiesSchema,
});

// Original y/ar, ir/cr, dr/mr, pr/fr, Sr/Cr. Keep construction lazy, just as _.
export namespace ListBrowsersCommand {
  export const commandType = "list_browsers";
  export const PayloadSchema = z.object({});
  export const ResultSchema = z.array(BrowserInfoSchema);
  export function create(payload = {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace GetBrowserCommand {
  export const commandType = "get_browser";
  export const PayloadSchema = z.object({ id: z.string() });
  export const ResultSchema = BrowserSchema;
  export function create(payload: { id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace GetDefaultBrowserCommand {
  export const commandType = "get_default_browser";
  export const PayloadSchema = z.object({});
  export const ResultSchema = BrowserSchema;
  export function create(payload = {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace GetDocumentationCommand {
  export const commandType = "get_documentation";
  export const PayloadSchema = z.object({ name: z.string() });
  export const ResultSchema = z.string();
  export function create(payload: { name: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace GetBrowserForUrlCommand {
  export const commandType = "get_browser_for_url";
  export const PayloadSchema = z.object({ url: z.string().url() });
  export const ResultSchema = BrowserSchema;
  export function create(payload: { url: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
