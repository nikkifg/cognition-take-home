/** A request blocked by policy (RBAC, approvals). Maps to HTTP 403. */
export class PolicyError extends Error {
  readonly status = 403;
}

export class ForbiddenError extends PolicyError {
  constructor(readonly permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export class SelfApprovalError extends PolicyError {
  constructor() {
    super("Requester cannot approve their own request");
    this.name = "SelfApprovalError";
  }
}

export class ApprovalStateError extends PolicyError {
  name = "ApprovalStateError";
}
