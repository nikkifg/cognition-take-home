import { PolicyError } from "@/platform/errors";

/** Change blocked by its state or input, e.g. a change is already pending. Audited as a denial. */
export class PayoutChangeError extends PolicyError {
  name = "PayoutChangeError";
}
