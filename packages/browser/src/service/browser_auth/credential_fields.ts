/** Original M8. The order is retained from the installed shared classifier. */
export const credentialUsernameTypes = [
  "text",
  "email",
  "tel",
  "number",
  "search",
  "url",
];
export interface CredentialField {
  id: string;
  type: string;
  autocomplete?: string | null;
  label?: string | null;
  [key: string]: any;
}
/** Original KT: classify existing credentials, excluding OTP and new-password fields. */
export function classifyCredentialFields<T extends CredentialField>(
  fields: T[],
  allowPasswordOnly = false,
  optionFieldIds?: string[][] | null,
): { username?: T; password: T } | undefined {
  let candidates = fields.filter((field) => {
    const autocomplete = field.autocomplete?.toLowerCase().split(/\s+/) ?? [];
    const label = field.label?.replace(/[\p{Dash}_\s]+/gu, " ") ?? "";
    return (
      !autocomplete.includes("one-time-code") &&
      !autocomplete.includes("new-password") &&
      !/\b(?:[ht]?otp|one ?time(?: ?(?:password|passcode|code))?|verification code|security code|authentication code|2fa|mfa)\b/i.test(
        label,
      )
    );
  });
  if (optionFieldIds != null) {
    const passwordOptions = optionFieldIds.filter((ids) =>
      candidates.some(
        ({ id, type }) => type === "password" && ids.includes(id),
      ),
    );
    const [selected] = passwordOptions;
    if (passwordOptions.length !== 1 || selected == null) return;
    candidates = candidates.filter(({ id }) => selected.includes(id));
  }
  const passwords = candidates.filter(({ type }) => type === "password");
  const usernames = candidates.filter(({ type, autocomplete, label }) => {
    if (!credentialUsernameTypes.includes(type)) return false;
    if (autocomplete?.toLowerCase().split(/\s+/).includes("username"))
      return true;
    const normalized = label?.replace(/[\p{Dash}_\s]+/gu, " ").trim() ?? "";
    if (/^(?:code|passcode|pin|token)[:*]?$/i.test(normalized)) return false;
    return (
      type !== "number" ||
      /\b(?:user ?name|(?:user|login|account|customer|member|membership|rapid rewards) (?:id|number|no\.?))\b|^(?:account|login|user|member)[:*]?$/i.test(
        normalized,
      )
    );
  });
  const explicitUsernames = usernames.filter(({ autocomplete }) =>
    autocomplete?.toLowerCase().split(/\s+/).includes("username"),
  );
  const preferred =
    explicitUsernames.length > 0 ? explicitUsernames : usernames;
  const username = preferred.length === 1 ? preferred[0] : undefined;
  const password = passwords.length === 1 ? passwords[0] : undefined;
  if (username != null && password != null && username.id !== password.id)
    return { username, password };
  if (allowPasswordOnly && preferred.length === 0 && password != null)
    return { password };
}
/** Original Rc: inspect-derived metadata takes precedence over requested type/label. */
export function classifyAuthCredentialFields(
  fields: any[],
  allowPasswordOnly = false,
  options?: Array<{ field_ids?: string[] | null }> | null,
) {
  return classifyCredentialFields(
    fields.map(({ id, labelMetadata, ...rest }) => ({
      ...rest,
      id,
      labelMetadata,
      type: labelMetadata.input_type,
      autocomplete: labelMetadata.autocomplete,
      label: labelMetadata.accessible_name,
    })),
    allowPasswordOnly,
    options?.map(({ field_ids }) => field_ids ?? []),
  );
}
