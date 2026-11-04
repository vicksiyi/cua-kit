import { createIntl, createIntlCache } from "@formatjs/intl";
import { match } from "@formatjs/intl-localematcher";
import { browserMessages } from "./messages";
const supportedLocales = ["en-US", ...Object.keys(browserMessages)];
const cache = createIntlCache();
/** Original k3: underscores normalize before best-fit matching; only RangeError falls back. */
export function createBrowserLocalizer(locale = "en-US") {
  let selected = "en-US";
  try {
    selected = match([locale.replaceAll("_", "-")], supportedLocales, "en-US");
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
  const intl = createIntl(
    {
      locale: selected,
      defaultLocale: "en-US",
      messages: browserMessages[selected] ?? {},
    },
    cache,
  );
  return (descriptor: Parameters<typeof intl.formatMessage>[0], values?: any) =>
    intl.formatMessage(descriptor, values);
}
