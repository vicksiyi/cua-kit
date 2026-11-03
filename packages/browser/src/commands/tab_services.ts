import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
export namespace ContentExportCommand {
  export const commandType = "tab_content_export";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({ path: z.string() });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ContentExportGsuiteCommand {
  export const commandType = "tab_content_export_gsuite";
  export const GSuiteExportTypeSchema = z.enum([
    "pdf",
    "md",
    "xlsx",
    "csv",
    "docx",
    "pptx",
  ]);
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    format: GSuiteExportTypeSchema,
  });
  export const ResultSchema = z.object({ path: z.string() });
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    format: string;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ContentExportYouTubeTranscriptCommand {
  export const commandType = "tab_content_export_youtube_transcript";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({ path: z.string() });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ClipboardReadTextCommand {
  export const commandType = "tab_clipboard_read_text";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({ text: z.string() });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ClipboardWriteTextCommand {
  export const commandType = "tab_clipboard_write_text";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    text: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    text: string;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
// Original ys/fs and Ss/Ts are separate schema instances with identical definitions.
const readEntrySchema = z
  .object({
    mime_type: z.string(),
    text: z.string().optional(),
    base64: z.string().optional(),
  })
  .superRefine((entry: any, context: any) => {
    if ((entry.text !== undefined) === (entry.base64 !== undefined))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Clipboard entries must set exactly one of text or base64",
      });
  });
const readItemSchema = z.object({
  entries: z.array(readEntrySchema),
  presentation_style: z
    .enum(["unspecified", "inline", "attachment"])
    .optional(),
});
export namespace ClipboardReadCommand {
  export const commandType = "tab_clipboard_read";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({ items: z.array(readItemSchema) });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
const writeEntrySchema = z
  .object({
    mime_type: z.string(),
    text: z.string().optional(),
    base64: z.string().optional(),
  })
  .superRefine((entry: any, context: any) => {
    if ((entry.text !== undefined) === (entry.base64 !== undefined))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Clipboard entries must set exactly one of text or base64",
      });
  });
const writeItemSchema = z.object({
  entries: z.array(writeEntrySchema),
  presentation_style: z
    .enum(["unspecified", "inline", "attachment"])
    .optional(),
});
export namespace ClipboardWriteCommand {
  export const commandType = "tab_clipboard_write";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    items: z.array(writeItemSchema),
  });
  export const ResultSchema = z.object({});
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    items: any[];
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace DevLogsCommand {
  export const commandType = "tab_dev_logs";
  export const LogLevelSchema = z.enum([
    "debug",
    "info",
    "log",
    "warn",
    "error",
  ]);
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    filter: z.string().optional(),
    levels: z.array(LogLevelSchema).optional(),
    limit: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({
    logs: z.array(
      z.object({
        level: LogLevelSchema,
        message: z.string(),
        timestamp: z.string(),
        url: z.string().optional(),
      }),
    ),
  });
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    filter?: string;
    levels?: string[];
    limit?: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
