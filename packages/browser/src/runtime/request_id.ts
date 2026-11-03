/** Original cl: timestamp/random hex formatting, with no padding or counter. */
export const generateRequestId = () =>
  `req-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
