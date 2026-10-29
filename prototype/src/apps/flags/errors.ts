import { PolicyError } from "@/platform/errors";

/** The flag isn't in a state that allows the change (already set, change pending). */
export class FlagStateError extends PolicyError {
  name = "FlagStateError";
}
