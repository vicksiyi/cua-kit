import type { NativePipeOptions } from "./native_pipe";
interface BrokerTransport {
  setMessageCallback(callback: (message: any) => void): void;
  addCloseListener(callback: (error?: Error) => void): unknown;
  sendMessage(message: any): void;
  close(error?: Error): void;
}
type Connect = (
  path: string,
  options: NativePipeOptions,
  unavailable?: string,
) => Promise<BrokerTransport>;
const challengePattern = /^[A-Za-z0-9_-]{32,128}$/;
const optionPattern = /^[A-Za-z0-9_-]{1,48}$/;
const statuses = new Set([
  "submitted",
  "declined",
  "cancelled",
  "unavailable",
  "expired",
  "origin_changed",
  "page_changed",
  "locator_invalid",
  "submission_failed",
]);
function record(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
function fields(value: unknown) {
  if (!record(value)) return null;
  const result: Record<string, string> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return null;
    result[key] = item;
  }
  return result;
}
/** Original Bx: first result wins and unused promises never produce unhandled rejections. */
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const state = {
    promise: new Promise<T>((accept, fail) => {
      resolve = accept;
      reject = fail;
    }),
    settled: false,
    resolve(value: T) {
      if (!state.settled) {
        state.settled = true;
        resolve(value);
      }
    },
    reject(error: unknown) {
      if (!state.settled) {
        state.settled = true;
        reject(error);
      }
    },
  };
  state.promise.catch(() => {});
  return state;
}
/** Original b6/lb. Transport creation is always the privileged ub bridge. */
export function createNativeAuthBroker(connect: Connect) {
  async function getNativeCredentialObservationStatus(
    runtime: any,
    session: string,
    expectedChallengeId?: string,
  ) {
    const path = runtime.env.BROWSER_AUTH_BROKER_SOCKET_PATH?.trim();
    if (!path || !session || session.length > 256)
      throw new Error("Native credential state is unavailable");
    const transport = await connect(
      path,
      {
        decodeMessage: (value) => value,
        maxFrameBytes: 1024,
        singleResponse: true,
      },
      "Native credential state is unavailable",
    );
    return await new Promise<boolean>((resolve, reject) => {
      let done = false;
      const finish = (used?: boolean) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          transport.close();
          if (used === undefined)
            reject(new Error("Native credential state is unavailable"));
          else resolve(used);
        }
      };
      const timer = setTimeout(() => finish(), 3000);
      transport.addCloseListener(() => finish());
      transport.setMessageCallback((message) => {
        if (!done) {
          if (
            !record(message) ||
            Object.keys(message).length !== 2 ||
            message.type !== "native_observation_status" ||
            typeof message.used !== "boolean"
          )
            return finish();
          finish(message.used);
        }
      });
      try {
        transport.sendMessage({
          type: "native_observation_status",
          session_id: session,
          expected_challenge_id: expectedChallengeId,
        });
      } catch {
        finish();
      }
    });
  }
  class BrowserAuthChallenge {
    registered = deferred<string>();
    submission = deferred<any>();
    completed = deferred<string>();
    challengeId: string | null = null;
    submissionReceived = false;
    resultSent = false;
    supportsPasswordSubmissionMetadata = false;
    closed = false;
    constructor(public transport: BrokerTransport) {
      transport.setMessageCallback((message) => this.handleMessage(message));
      transport.addCloseListener((error) =>
        this.fail(
          error ?? new Error("browser auth broker closed unexpectedly"),
        ),
      );
    }
    static async create(
      runtime: any,
      challengeFields: any,
      options?: any,
      config?: any,
    ) {
      const path = runtime.env.BROWSER_AUTH_BROKER_SOCKET_PATH?.trim();
      if (!path) throw new Error("browser auth broker is unavailable");
      const transport = await connect(
        path,
        {
          closedBeforeResponseMessage:
            "browser auth broker closed unexpectedly",
          decodeMessage: (value) => value,
          maxFrameBytes: 128 * 1024,
        },
        "browser auth broker is unavailable",
      );
      const challenge = new BrowserAuthChallenge(transport);
      challenge.send({
        type: "register",
        fields: challengeFields,
        ...(options == null ? {} : { options }),
        ...(config?.qrCode === true ? { qr_code: true } : {}),
        origins: config?.origins,
        account_username: config?.accountUsername,
        manual_save_fields: config?.manualSaveFields,
        manual_save_session_id: config?.manualSaveSessionId,
        credential_binding: config?.credentialBinding,
        email_otp_session_id: config?.emailOtpSessionId,
      });
      await challenge.registered.promise;
      return challenge;
    }
    get id() {
      if (this.challengeId == null)
        throw new Error("browser auth challenge is not registered");
      return this.challengeId;
    }
    async waitForSubmission() {
      return await this.submission.promise;
    }
    get hasSubmission() {
      return this.submissionReceived;
    }
    async complete(status: string, passwordSubmitted?: boolean) {
      if (!this.resultSent) {
        this.resultSent = true;
        this.send({
          type: "result",
          challenge_id: this.id,
          status,
          password_submitted: this.supportsPasswordSubmissionMetadata
            ? passwordSubmitted
            : undefined,
        });
      }
      return await this.completed.promise;
    }
    publishQrCodePayload(payload: string, disappeared?: boolean) {
      if (payload.length === 0)
        throw new Error("invalid browser auth QR code payload");
      this.send({
        type: "qr_code_snapshot",
        challenge_id: this.id,
        payload,
        ...(disappeared === true ? { disappeared: true } : {}),
      });
    }
    close() {
      if (!this.closed) {
        this.closed = true;
        this.transport.close();
      }
    }
    send(message: any) {
      if (this.closed) throw new Error("browser auth broker is closed");
      this.transport.sendMessage(message);
    }
    handleMessage(message: any) {
      if (!record(message) || typeof message.type !== "string")
        throw new Error("invalid browser auth broker message");
      if (message.type === "registered") {
        if (
          typeof message.challenge_id !== "string" ||
          !challengePattern.test(message.challenge_id)
        )
          throw new Error("invalid browser auth challenge id");
        this.challengeId = message.challenge_id;
        this.supportsPasswordSubmissionMetadata =
          message.password_submission_metadata === true;
        this.registered.resolve(message.challenge_id);
        return;
      }
      if (message.type === "submission") {
        if (message.challenge_id !== this.id)
          throw new Error("browser auth challenge id mismatch");
        if (this.resultSent) return;
        const values = fields(message.fields);
        if (values == null) throw new Error("invalid browser auth submission");
        const selected = message.selected_option;
        if (
          selected !== undefined &&
          (typeof selected !== "string" || !optionPattern.test(selected))
        )
          throw new Error("invalid browser auth submission");
        const native = message.native_credential_delivery;
        if (native !== undefined && native !== true)
          throw new Error("invalid native credential delivery");
        const ordinary = message.ordinary_credential_delivery;
        if (
          (ordinary !== undefined && ordinary !== true) ||
          (ordinary === true && native === true)
        )
          throw new Error("invalid ordinary credential delivery");
        const manual = message.manual_credential_save;
        if (manual !== undefined && manual !== true)
          throw new Error("invalid manual credential saving");
        const email = message.email_otp_delivery;
        if (
          (email !== undefined && email !== true) ||
          (email === true &&
            (native === true || ordinary === true || manual === true))
        )
          throw new Error("invalid email OTP delivery");
        const predecessor = message.native_observation_predecessor;
        if (predecessor != null && typeof predecessor !== "string")
          throw new Error("invalid native credential observation receipt");
        this.submissionReceived = true;
        this.submission.resolve({
          fields: values,
          email_otp_delivery: email,
          native_credential_delivery: native,
          ordinary_credential_delivery: ordinary,
          manual_credential_save: manual,
          native_observation_predecessor: predecessor,
          ...(selected === undefined ? {} : { selected_option: selected }),
        });
        return;
      }
      if (message.type === "completed") {
        if (message.challenge_id !== this.id || !statuses.has(message.status))
          throw new Error("invalid browser auth completion");
        this.completed.resolve(message.status);
        this.submission.resolve({ status: message.status });
        return;
      }
      throw new Error("browser auth broker rejected the request");
    }
    fail(error: Error) {
      if (!this.closed) {
        this.closed = true;
        this.registered.reject(error);
        this.submission.reject(error);
        this.completed.reject(error);
        this.transport.close(error);
      }
    }
  }
  return { BrowserAuthChallenge, getNativeCredentialObservationStatus };
}
