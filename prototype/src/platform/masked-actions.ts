"use server";

import { runAction } from "./actions";
import { revealField } from "./sensitive";
import { requireUser } from "./session";

export async function revealSensitiveValue(app: string, field: string, entityId: string) {
  const user = await requireUser();
  return runAction(revealField, user, { app, field, entityId });
}
