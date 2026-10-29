import { PolicyError } from "@/platform/errors";

/** The case isn't in a state that allows the action (already claimed, not yours, closed). */
export class CaseStateError extends PolicyError {
  name = "CaseStateError";
}
