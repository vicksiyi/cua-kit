import { readAuthActionTargets, authSubmissionOrigin } from "./action_review";
import { isQrOnlyAuth, createAuthFieldPlan } from "./field_plan";
import { httpOrigin } from "../security/authority_builder";
import {
  readAuthPageBinding,
  readAuthFormBinding,
  readAuthOptionBindings,
  sameAuthDocument,
  revalidateAuthPage,
  revalidateAuthForm,
  readAuthFrameBinding,
} from "./bindings";
import {
  inspectAuthFields,
  validAuthFields,
  validAuthOptions,
  validAuthControl,
} from "./field_inspection";
export interface AuthCheckpointDependencies {
  actionTargets(request: any, context: any): Promise<any>;
  classifyCredentialFields(
    fields: any[],
    passwordOnly: boolean,
    options: any,
  ): any;
  submissionOrigin(
    request: any,
    context: any,
    requirePost?: boolean,
  ): Promise<any>;
}
/** Original yv. Credential classification remains required; action review and submission origin default to their restored implementations. */
export function createAuthCheckpointClass(
  supplied: Pick<AuthCheckpointDependencies, "classifyCredentialFields"> &
    Partial<AuthCheckpointDependencies>,
) {
  const dependencies: AuthCheckpointDependencies = {
    actionTargets: readAuthActionTargets,
    submissionOrigin: authSubmissionOrigin,
    ...supplied,
  };
  class AuthCheckpoint {
    constructor(
      params: any,
      context: any,
      pageBinding: any,
      formBinding: any,
      optionBindings: any,
      credentialPlan: any,
      reviewedActionTargets?: any,
    ) {
      this.params = params;
      this.ctx = context;
      this.pageBinding = pageBinding;
      this.formBinding = formBinding;
      this.optionBindings = optionBindings;
      this.credentialPlan = credentialPlan;
      this.reviewedActionTargets = reviewedActionTargets;
      if (
        ((this.currentOrigin = params.origin),
        formBinding == null && !isQrOnlyAuth(params))
      )
        throw new Error(
          "Browser auth form binding is required for non-QR requests.",
        );
    }
    params: any;
    ctx: any;
    pageBinding: any;
    formBinding: any;
    optionBindings: any;
    credentialPlan: any;
    reviewedActionTargets: any;
    nativeDelivery = false;
    manualCredentialSave = false;
    credentialSubmissionFields: any;
    ordinaryCredentialFields: any;
    manualSavingRejection: any;
    manualSubmission: any;
    ordinaryAttempt: any;
    completedOrdinaryFields = new Set<string>();
    ordinaryReinspections = 0;
    currentOrigin: any;
    completeOrdinaryField(fieldId: any): any {
      this.ordinaryAttempt != null && this.completedOrdinaryFields.add(fieldId);
    }
    async reinspectOrdinary(reason: any): Promise<any> {
      if (
        this.ordinaryAttempt == null ||
        (reason !== "page_changed" &&
          reason !== "origin_changed" &&
          reason !== "locator_invalid" &&
          reason !== "prompt_changed")
      )
        return false;
      for (; this.ordinaryReinspections < 3;) {
        let attempt = ++this.ordinaryReinspections;
        this.ordinaryAttempt.recordAttempt({
          kind: "reinspection_started",
          reinspection: attempt,
          outcome: reason,
        });
        let outcome = "locator_invalid";
        try {
          let page = await readAuthPageBinding(
            this.params.tab_id,
            undefined,
            this.ctx,
          );
          if (typeof page == "string") outcome = page;
          else {
            page.frameId !== this.pageBinding.frameId
              ? this.ordinaryAttempt.recordAttempt({ kind: "frame_changed" })
              : page.loaderId !== this.pageBinding.loaderId
                ? this.ordinaryAttempt.recordAttempt({
                    kind: "document_changed",
                  })
                : page.url !== this.pageBinding.url &&
                  this.ordinaryAttempt.recordAttempt({ kind: "url_changed" });
            let origin = httpOrigin(page.securityOrigin);
            if (origin == null || new URL(origin).protocol !== "https:")
              outcome = "origin_changed";
            else {
              let request = {
                  ...this.paramsForSelectedOption(),
                  origin: origin,
                },
                [fields, form, options, targets] = await Promise.all([
                  inspectAuthFields(request, this.ctx, true),
                  readAuthFormBinding(request, this.ctx),
                  readAuthOptionBindings(request, this.ctx),
                  this.reviewedActionTargets == null
                    ? undefined
                    : dependencies.actionTargets(request, this.ctx),
                ]),
                submissionFields = this.credentialSubmissionFields?.map(
                  (field: any) =>
                    fields?.find(({ id }: any) => id === field.id) ?? field,
                ),
                classified =
                  submissionFields == null
                    ? undefined
                    : dependencies.classifyCredentialFields(
                        submissionFields,
                        this.ordinaryCredentialFields?.username == null,
                        this.params.options,
                      ),
                refreshed = await readAuthPageBinding(
                  this.params.tab_id,
                  origin,
                  this.ctx,
                );
              if (
                fields != null &&
                form?.origin === origin &&
                options != null &&
                (this.reviewedActionTargets == null || targets != null) &&
                classified?.username?.id ===
                  this.ordinaryCredentialFields?.username &&
                classified?.password.id ===
                  this.ordinaryCredentialFields?.password &&
                (await validAuthOptions(request, this.ctx)) &&
                typeof refreshed != "string" &&
                sameAuthDocument(page, refreshed)
              )
                return (
                  (this.currentOrigin = origin),
                  (this.pageBinding = page),
                  (this.formBinding = form),
                  (this.optionBindings = options),
                  (this.reviewedActionTargets = targets ?? undefined),
                  (this.credentialSubmissionFields = submissionFields),
                  this.ordinaryAttempt.refreshOrdinaryDocument(
                    page.frameId,
                    origin,
                  ),
                  this.ordinaryAttempt.recordAttempt({
                    kind: "reinspection_succeeded",
                    reinspection: attempt,
                  }),
                  true
                );
              typeof refreshed == "string"
                ? (outcome = refreshed)
                : sameAuthDocument(page, refreshed) ||
                  (outcome = "page_changed");
            }
          }
        } catch {
          outcome = "locator_invalid";
        }
        this.ordinaryAttempt.recordAttempt({
          kind: "reinspection_failed",
          reinspection: attempt,
          outcome: outcome,
        });
      }
      return false;
    }
    async revalidateBeforeAction(option?: any, field?: any): Promise<any> {
      let rejection = this.manualSavingRejection?.();
      if (rejection != null) return rejection;
      let selected = this.paramsForSelectedOption(option),
        focused =
          field == null
            ? selected
            : {
                ...selected,
                fields: "type" in field ? [field] : [],
                submit: "action" in field ? field : undefined,
              },
        pageStatus = await revalidateAuthPage(
          selected.tab_id,
          this.currentOrigin,
          this.pageBinding,
          this.ctx,
        );
      if (pageStatus != null) return pageStatus;
      if (
        !(await validAuthFields(focused, this.ctx)) ||
        (option?.selector != null &&
          (this.reviewedActionTargets != null ||
            (option.field_ids?.length ?? 0) === 0) &&
          !(await validAuthControl(option.selector, selected, this.ctx)))
      )
        return "locator_invalid";
      let optionStatus = await this.revalidateOptionBindings(option);
      return (
        optionStatus ??
        (this.formBinding == null
          ? null
          : ((await revalidateAuthForm(
              focused,
              this.formBinding,
              this.ctx,
              this.params.fields[0]?.selector,
            )) ?? (await this.revalidateCredentialSubmission())))
      );
    }
    async revalidateReviewedPresentation(
      option?: any,
      promptOption: any = option,
    ): Promise<any> {
      let status =
        this.reviewedActionTargets == null
          ? await this.revalidateBeforeAction(option)
          : await this.revalidate(option, false, promptOption);
      return status === "prompt_changed" ? "page_changed" : status;
    }
    async revalidateBeforeSubmit(option?: any): Promise<any> {
      let status = await this.revalidateBeforeAction(
        option,
        this.params.submit,
      );
      return status != null || this.reviewedActionTargets == null
        ? status
        : (await dependencies.submissionOrigin(
              this.params,
              this.ctx,
              this.nativeDelivery || this.manualCredentialSave,
            )) === this.reviewedActionTargets.submissionOrigin
          ? null
          : "origin_changed";
    }
    async revalidate(
      option?: any,
      skipValidation: any = false,
      promptOption: any = option,
    ): Promise<any> {
      let rejection = this.manualSavingRejection?.();
      if (rejection != null) return rejection;
      let { ctx: context } = this,
        selected = this.paramsForSelectedOption(option),
        pageStatus = await revalidateAuthPage(
          selected.tab_id,
          this.currentOrigin,
          this.pageBinding,
          context,
        );
      if (pageStatus != null) return pageStatus;
      let fields = await inspectAuthFields(
        selected,
        context,
        this.reviewedActionTargets != null,
        skipValidation,
      );
      if (
        fields == null ||
        (!skipValidation && !(await validAuthOptions(selected, context)))
      )
        return "locator_invalid";
      let optionStatus = await this.revalidateOptionBindings(option);
      if (optionStatus != null) return optionStatus;
      let { credentialFieldMetadata: metadata, promptFields: prompts } =
          createAuthFieldPlan(fields),
        targets = await dependencies.actionTargets(selected, context);
      if (targets == null) return "locator_invalid";
      let expectedTargets =
        option == null
          ? this.reviewedActionTargets
          : {
              ...this.reviewedActionTargets,
              options:
                this.reviewedActionTargets?.options.filter(
                  ({ id }: any) => id === option.id,
                ) ?? [],
            };
      if (JSON.stringify(targets) !== JSON.stringify(expectedTargets))
        return "prompt_changed";
      if (this.formBinding != null) {
        let formStatus = await revalidateAuthForm(
          selected,
          this.formBinding,
          context,
          this.params.fields[0]?.selector,
        );
        if (formStatus != null) return formStatus;
      }
      let secondPageStatus = await revalidateAuthPage(
        selected.tab_id,
        this.currentOrigin,
        this.pageBinding,
        context,
      );
      if (secondPageStatus != null) return secondPageStatus;
      let submissionStatus = await this.revalidateCredentialSubmission();
      if (submissionStatus != null) return submissionStatus;
      if (this.ordinaryCredentialFields != null) return null;
      let expectedPrompts =
          promptOption == null
            ? this.credentialPlan.promptFields
            : this.credentialPlan.promptFields.filter(({ id }: any) =>
                (promptOption.field_ids ?? []).includes(id),
              ),
        expectedMetadata = this.credentialPlan.credentialFieldMetadata;
      return (
        promptOption != null &&
          (expectedMetadata = expectedMetadata.filter(({ id }: any) =>
            (promptOption.field_ids ?? []).includes(id),
          )),
        JSON.stringify(prompts) !== JSON.stringify(expectedPrompts) ||
        JSON.stringify(metadata) !== JSON.stringify(expectedMetadata)
          ? "prompt_changed"
          : null
      );
    }
    async revalidateForReview(): Promise<any> {
      return await this.revalidate(undefined, true);
    }
    async revalidateCredentialSubmission(
      context: any = this.ctx,
    ): Promise<any> {
      let rejection = this.manualSavingRejection?.();
      if (rejection != null) return rejection;
      if (this.credentialSubmissionFields != null) {
        let selected = this.paramsForSelectedOption();
        if (!(await validAuthFields(selected, this.ctx))) return "page_changed";
        let fields = await inspectAuthFields(selected, context, true, true);
        if (fields == null || fields.length !== selected.fields.length)
          return "page_changed";
        if (this.ordinaryCredentialFields != null) {
          let classified = dependencies.classifyCredentialFields(
            this.credentialSubmissionFields.map(
              (candidate: any) =>
                fields.find(({ id: id }: any) => id === candidate.id) ??
                candidate,
            ),
            this.ordinaryCredentialFields.username == null,
            this.params.options,
          );
          if (
            classified?.username?.id !==
              this.ordinaryCredentialFields.username ||
            classified?.password.id !== this.ordinaryCredentialFields.password
          )
            return "page_changed";
        } else if (
          fields.some(
            (classified: any, candidate: any) =>
              classified.required !==
              this.credentialSubmissionFields?.[candidate]?.required,
          )
        )
          return "page_changed";
      }
      return !this.nativeDelivery && !this.manualCredentialSave
        ? null
        : this.formBinding == null
          ? "locator_invalid"
          : (await dependencies.submissionOrigin(
                this.params,
                context,
                true,
              )) === this.formBinding.origin
            ? null
            : "origin_changed";
    }
    async revalidateOptionBindings(option?: any): Promise<any> {
      let options = option == null ? this.params.options : [option];
      return (
        (
          await Promise.all(
            (options ?? []).map(async (candidate: any) => {
              if (candidate.selector == null) return null;
              let previous = this.optionBindings.get(candidate.id);
              if (previous == null) return "locator_invalid";
              let binding;
              try {
                binding = await readAuthFrameBinding(
                  this.params.tab_id,
                  candidate.selector,
                  this.params.timeout_ms,
                  this.ctx,
                );
              } catch {
                return "locator_invalid";
              }
              return binding.targetKey !== previous.targetKey
                ? "page_changed"
                : binding.origin !== previous.origin
                  ? "origin_changed"
                  : sameAuthDocument(previous, binding)
                    ? null
                    : "page_changed";
            }),
          )
        ).find((candidate: any) => candidate != null) ?? null
      );
    }
    paramsForSelectedOption(option?: any): any {
      let allowedIds =
        this.reviewedActionTargets == null || option == null
          ? undefined
          : new Set(option.field_ids ?? []);
      return {
        ...this.params,
        origin: this.currentOrigin,
        fields: this.params.fields.filter(
          ({ id: id }: any) =>
            (allowedIds == null || allowedIds.has(id)) &&
            !this.completedOrdinaryFields.has(id),
        ),
        options:
          allowedIds == null || option == null ? this.params.options : [option],
      };
    }
  }
  return AuthCheckpoint;
}
