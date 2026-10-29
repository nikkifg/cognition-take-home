import appsConfig from "@/apps.config";
import type { AppDefinition, SensitiveField } from "./types";

const registry = new Map<string, AppDefinition>();

function register(app: AppDefinition) {
  if (registry.has(app.id) || app.id === "platform") {
    throw new Error(`Duplicate or reserved app id: ${app.id}`);
  }
  for (const name of Object.keys(app.permissions)) {
    if (!name.startsWith(`${app.id}.`)) {
      throw new Error(`Permission "${name}" must start with "${app.id}."`);
    }
  }
  registry.set(app.id, app);
}

appsConfig.forEach(register);

export function listApps(): AppDefinition[] {
  return [...registry.values()];
}

export function getApp(id: string): AppDefinition | undefined {
  return registry.get(id);
}

export function getSensitiveField(appId: string, field: string): SensitiveField {
  const def = registry.get(appId)?.sensitiveFields?.[field];
  if (!def) throw new Error(`Unknown sensitive field ${appId}:${field}`);
  return def;
}

/** Test-only: register a fixture app. Real apps go in apps.config.ts. */
export function registerAppForTesting(app: AppDefinition) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("registerAppForTesting is only available in tests");
  }
  register(app);
}
