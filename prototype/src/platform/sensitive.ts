import { defineAction } from "./actions";
import { getSensitiveField } from "./registry";

export type FieldRef = { app: string; field: string; entityId: string };

export const defaultMask = (v: string) => `••••${v.slice(-4)}`;

/** Reveal a registered sensitive field. Requires the field's permission and is audited. */
export const revealField = defineAction({
  name: "field.reveal",
  app: "platform",
  permission: (ref: FieldRef) => getSensitiveField(ref.app, ref.field).permission,
  run: async (ctx, ref: FieldRef) => {
    const def = getSensitiveField(ref.app, ref.field);
    const value = await def.read(ctx.tx, ref.entityId);
    if (value == null) throw new Error("Record not found");
    // Never put the revealed value in the audit log.
    await ctx.audit({
      app: ref.app,
      entityType: ref.field,
      entityId: ref.entityId,
      reason: `Revealed ${def.label}`,
    });
    return value;
  },
});
