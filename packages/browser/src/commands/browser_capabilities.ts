import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
/** Original Ch/Mh and Ph/$h/Zh/Eh/Nh. */
export namespace ManagementCallCommand {
  export const commandType = "browser_management_call";
  export const PayloadSchema = z.object({
    args: z.array(z.unknown()),
    browser_id: z.string(),
    method: z.string(),
    namespace: z.string(),
  });
  export const ResultSchema = z.object({ value: z.unknown() });
  export function create(payload: {
    args: unknown[];
    browser_id: string;
    method: string;
    namespace: string;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ManagementAuditTrailCommand {
  export const commandType = "browser_management_get_audit_trail";
  export const PayloadSchema = ManagementCallCommand.PayloadSchema.pick({
    browser_id: true,
  });
  export const AuditChangeSchema = ManagementCallCommand.PayloadSchema.omit({
    browser_id: true,
  }).extend({
    before: z
      .object({
        bookmarks: z.array(
          z.object({
            id: z.string(),
            index: z.number().optional(),
            parentId: z.string().optional(),
            title: z.string(),
            url: z.string().optional(),
          }),
        ),
        tabLayout: z.object({
          groups: z.array(
            z.object({
              collapsed: z.boolean(),
              color: z.string(),
              id: z.number(),
              title: z.string().optional(),
              windowId: z.number(),
            }),
          ),
          tabs: z.array(
            z.object({
              autoDiscardable: z.boolean(),
              groupId: z.number(),
              id: z.number(),
              index: z.number(),
              pinned: z.boolean(),
              url: z.string().optional(),
              windowId: z.number(),
            }),
          ),
        }),
        windows: z.array(
          z.object({
            focused: z.boolean(),
            height: z.number().optional(),
            id: z.number(),
            left: z.number().optional(),
            state: z.string().optional(),
            top: z.number().optional(),
            width: z.number().optional(),
          }),
        ),
      })
      .partial(),
    createdAt: z.number(),
    result: z.union([z.number(), z.object({ id: z.string() })]).optional(),
  });
  export const ResultSchema = z.object({ changes: z.array(AuditChangeSchema) });
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace VisibilityGetCommand {
  export const commandType = "browser_visibility_get";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({ visible: z.boolean() });
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace VisibilitySetCommand {
  export const commandType = "browser_visibility_set";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    visible: z.boolean(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: { browser_id: string; visible: boolean }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ViewportResetCommand {
  export const commandType = "browser_viewport_reset";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({});
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ViewportSetCommand {
  export const commandType = "browser_viewport_set";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    height: z.number().int().positive(),
    width: z.number().int().positive(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: {
    browser_id: string;
    height: number;
    width: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export const BrowserManagementCommands = {
  Call: ManagementCallCommand,
  GetAuditTrail: ManagementAuditTrailCommand,
  commands: {
    [ManagementCallCommand.commandType]: ManagementCallCommand,
    [ManagementAuditTrailCommand.commandType]: ManagementAuditTrailCommand,
  },
};
export const BrowserVisibilityCommands = {
  Get: VisibilityGetCommand,
  Set: VisibilitySetCommand,
  commands: {
    [VisibilityGetCommand.commandType]: VisibilityGetCommand,
    [VisibilitySetCommand.commandType]: VisibilitySetCommand,
  },
};
export const BrowserViewportCommands = {
  Reset: ViewportResetCommand,
  Set: ViewportSetCommand,
  commands: {
    [ViewportResetCommand.commandType]: ViewportResetCommand,
    [ViewportSetCommand.commandType]: ViewportSetCommand,
  },
};
