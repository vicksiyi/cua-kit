import { CredentialSubmissionLease } from "./lease";
import { createCredentialLeaseRegistry } from "./lease_registry";
/** Original module-scoped Tf ownership, shared by credential submission and navigation cleanup. */
export const credentialLeases = createCredentialLeaseRegistry(
  CredentialSubmissionLease,
);
