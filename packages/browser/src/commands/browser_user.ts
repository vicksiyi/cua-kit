import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
/** Original ni/ui/_i commands. Schema ordering and discriminated union are retained. */
export namespace UserClaimTabCommand {
  export const commandType = "browser_user_claim_tab";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
  });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace UserGetTabContextCommand {
  export const commandType = "browser_user_get_tab_context";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("library_file"),
      libraryFileId: z.string().min(1),
      fileId: z.string().min(1),
      fileName: z.string(),
      mimeType: z.string(),
      title: z.string(),
      url: z.string(),
    }),
    z.object({
      kind: z.literal("text"),
      text: z.string(),
      title: z.string(),
      truncated: z.boolean(),
      url: z.string(),
    }),
    z.object({
      dataBase64: z.string(),
      fileName: z.string(),
      kind: z.literal("document"),
      mimeType: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ]);
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace UserOpenTabsCommand {
  export const commandType = "browser_user_open_tabs";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({
    tabs: z.array(
      z.object({
        id: z.string(),
        providerTabId: z.string().optional(),
        title: z.string().optional(),
        url: z.string().optional(),
        lastOpened: z.string().optional(),
        tabGroup: z.string().optional(),
      }),
    ),
  });
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
