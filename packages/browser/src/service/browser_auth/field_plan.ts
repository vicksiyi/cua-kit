export interface AuthField {
  id: string;
  selector: string;
  label: string;
  type: string;
  autocomplete?: string | null;
  required: boolean;
  labelMetadata: {
    accessible_name?: string | null;
    autocomplete?: string | null;
    input_name?: string | null;
    input_mode?: string | null;
    input_type?: string | null;
    [key: string]: unknown;
  };
}
export interface AuthOption {
  id: string;
  selector?: string;
  field_ids?: string[];
  [key: string]: unknown;
}
interface AuthRequest {
  fields: Pick<AuthField, "id" | "selector">[];
  options?: AuthOption[] | null;
  submit?: { action: string; selector?: string } | null;
  qr_code?: boolean;
}
export const otpPromptId = "otp";
export const maxCredentialValueLength = 16 * 1024;
/** Original ote. Preserve separate field/option selector namespaces and Enter submission exception. */
export function validAuthLocatorLayout(request: AuthRequest) {
  const ids = new Set<string>(),
    selectors = new Set<string>();
  for (const field of request.fields) {
    if (ids.has(field.id) || selectors.has(field.selector)) return false;
    ids.add(field.id);
    selectors.add(field.selector);
  }
  if (request.options != null) {
    const optionIds = new Set<string>(),
      optionSelectors = new Set<string>();
    for (const option of request.options) {
      if (optionIds.has(option.id)) return false;
      optionIds.add(option.id);
      if (option.selector != null) {
        if (
          optionSelectors.has(option.selector) ||
          selectors.has(option.selector)
        )
          return false;
        optionSelectors.add(option.selector);
      }
      const fields = option.field_ids ?? [];
      if (
        new Set(fields).size !== fields.length ||
        fields.some((id) => !ids.has(id))
      )
        return false;
    }
  }
  return request.submit == null
    ? true
    : request.submit.action === "press_enter" ||
        !selectors.has(request.submit.selector!);
}
/** Original Sv/ite. */
export function isQrOnlyAuth(request: AuthRequest) {
  return (
    request.qr_code === true &&
    request.fields.length === 0 &&
    request.options == null &&
    request.submit == null
  );
}
export function isAuthFrameSelector(selector: string) {
  return selector.includes(" >> internal:control=enter-frame >> ");
}
/** Original ate. Four or more same-type numeric/OTP fields collapse into one prompt. */
export function isSplitOtp(fields: AuthField[]) {
  return (
    fields.length >= 4 &&
    fields.every(
      (field) =>
        field.autocomplete?.toLowerCase() === "one-time-code" ||
        field.labelMetadata.autocomplete === "one-time-code" ||
        field.labelMetadata.input_mode === "numeric",
    ) &&
    fields.every((field) => field.type === fields[0]?.type)
  );
}
/** Original aN. Keep original field objects in fill bindings; only prompt metadata is projected. */
export function createAuthFieldPlan(fields: AuthField[]) {
  const first = fields[0];
  return first != null && isSplitOtp(fields)
    ? {
        credentialFieldMetadata: fields.map(({ labelMetadata }) => ({
          id: otpPromptId,
          ...labelMetadata,
        })),
        promptFields: [
          {
            id: otpPromptId,
            label: "Verification code",
            label_metadata: {
              ...first.labelMetadata,
              accessible_name: null,
              autocomplete: "one-time-code",
              input_name: null,
            },
            type: first.type,
            autocomplete: "one-time-code",
            required: true,
          },
        ],
        fillFields: [{ promptId: otpPromptId, fields }],
      }
    : {
        credentialFieldMetadata: fields.map(({ id, labelMetadata }) => ({
          id,
          ...labelMetadata,
        })),
        promptFields: fields.map(
          ({ id, label, labelMetadata, type, autocomplete, required }) => ({
            id,
            label,
            label_metadata: labelMetadata,
            type,
            autocomplete,
            required,
          }),
        ),
        fillFields: fields.map((field) => ({
          promptId: field.id,
          fields: [field],
        })),
      };
}
/** Original ste. A choice must include all or none of the fields grouped into an OTP prompt. */
export function mapAuthOptions(
  options: AuthOption[] | null | undefined,
  plan: ReturnType<typeof createAuthFieldPlan>,
) {
  if (options == null) return;
  const result: AuthOption[] = [];
  for (const option of options) {
    if (option.field_ids == null) {
      result.push(option);
      continue;
    }
    const ids = new Set(option.field_ids),
      mapped: string[] = [];
    let count = 0;
    for (const { promptId, fields } of plan.fillFields) {
      const included = fields.filter(({ id }) => ids.has(id));
      if (included.length !== 0) {
        if (included.length !== fields.length) return null;
        count += included.length;
        mapped.push(promptId);
      }
    }
    if (count !== ids.size) return null;
    result.push({ ...option, field_ids: mapped });
  }
  return result;
}
/** Original nN. */
export function allowsOrdinaryCredentialOption(
  options: AuthOption[] | null | undefined,
  fields: Pick<AuthField, "id" | "required">[],
  username: string | null | undefined,
  password: string,
  version: string | undefined,
) {
  const matching = options?.filter(
    ({ field_ids }) =>
      username != null &&
      field_ids?.includes(username) &&
      field_ids.includes(password),
  );
  if (matching != null && (version !== "1" || matching.length !== 1))
    return false;
  const ids = matching?.[0]?.field_ids;
  return fields.every(
    ({ id, required }) =>
      !required ||
      (ids != null && !ids.includes(id)) ||
      id === username ||
      id === password,
  );
}
/** Original tN/dte. */
export function findAuthOption(
  id: unknown,
  options: AuthOption[] | null | undefined,
) {
  if (options != null) return options.find((option) => option.id === id);
}
export function validAuthOptionValues(
  values: Record<string, unknown>,
  option: AuthOption,
  plan: ReturnType<typeof createAuthFieldPlan>,
) {
  const ids = new Set(option.field_ids ?? []);
  for (const field of plan.promptFields)
    if (
      (values[field.id] != null && !ids.has(field.id)) ||
      (ids.has(field.id) && field.required && !values[field.id])
    )
      return false;
  return true;
}
/** Original fte/hte. Length is UTF-16 string length, not bytes; result has a null prototype. */
export function validateAuthValues(
  value: unknown,
  fields: Array<{ id: string; required: boolean }>,
): Record<string, string> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value))
    return null;
  const ids = new Set(fields.map((field) => field.id)),
    result = Object.create(null);
  for (const [id, text] of Object.entries(value)) {
    if (
      !ids.has(id) ||
      typeof text !== "string" ||
      text.length > maxCredentialValueLength
    )
      return null;
    result[id] = text;
  }
  for (const field of fields)
    if (field.required && !result[field.id]) return null;
  return result;
}
/** Original Th. */
export async function completeAuthChallenge(
  challenge: { complete(value: any): Promise<any> },
  value: unknown,
) {
  try {
    return await challenge.complete(value);
  } catch {
    return "unavailable";
  }
}
