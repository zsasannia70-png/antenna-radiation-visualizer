/**
 * Pure, framework-agnostic logic for the AI assistant pipeline.
 *
 * The orchestration decisions (routing between function calling, RAG, clarifying
 * dialogue, and the fallback path) and the tool-argument validation live here,
 * separated from the React handler in App.tsx, so they can be unit- and
 * integration-tested without calling the live Gemini or Flowise services.
 */

import type { ConfigurationState } from "./physics";

export const ANTENNA_TYPES = [
  "Dipole (Half-Wave/Folded/Hertz)", "Short Dipole",
  "Monopole (Whip/Rubber Ducky/Ground Plane/Marconi)", "J-Pole",
  "Yagi-Uda", "Log-Periodic", "Parabolic Dish (Cassegrain/Gregorian)",
  "Horn (Pyramidal/Conical)", "Helical (Helix)", "Spiral",
  "Small Loop (NFC)", "Large Loop", "Patch (IFA/PIFA)", "Slot",
  "Dielectric Resonator", "Biconical (Discone/Bow-tie/Fractal)",
  "Turnstile (Batwing)", "V-Antenna (Rhombic/Beverage)", "Plasma Antenna",
  "Phased Array (AESA/PESA)", "MIMO Array", "Leaky Feeder", "Ferrite Rod",
];

export const ARRAY_GEOMETRIES = ["linear", "square", "circular", "triangular"] as const;
export const WORKSPACE_MODES = ["single", "2d", "3d", "manual"] as const;

const NUMERIC_KEYS = ["freq", "length", "elements", "spacing", "phaseShift", "stacks"];

/** The only configuration fields the model is permitted to set via updateConfig. */
export const ALLOWED_CONFIG_KEYS = [
  "type", "activeTab", "geometry", "antName", ...NUMERIC_KEYS,
] as const;

/**
 * Whitelist + type/enum validation for tool-call arguments. Anything outside the
 * schema — an unexpected key, a wrong type, or an invalid enum value — is
 * rejected rather than written to the simulation state. This prevents the model
 * from mutating arbitrary application state through the tool call.
 */
export function validateToolArgs(args: Record<string, unknown> | undefined): {
  patch: Partial<ConfigurationState>;
  applied: string[];
  rejected: string[];
} {
  const patch: Record<string, unknown> = {};
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(args ?? {})) {
    if (!(ALLOWED_CONFIG_KEYS as readonly string[]).includes(key)) {
      rejected.push(key);
      continue;
    }
    if (key === "geometry" && !(ARRAY_GEOMETRIES as readonly string[]).includes(value as string)) {
      rejected.push(key);
      continue;
    }
    if (key === "activeTab" && !(WORKSPACE_MODES as readonly string[]).includes(value as string)) {
      rejected.push(key);
      continue;
    }
    if (key === "type" && !ANTENNA_TYPES.includes(value as string)) {
      rejected.push(key);
      continue;
    }
    if (NUMERIC_KEYS.includes(key) && (typeof value !== "number" || Number.isNaN(value))) {
      rejected.push(key);
      continue;
    }
    patch[key] = value;
    applied.push(`${key} = ${value}`);
  }

  return { patch: patch as Partial<ConfigurationState>, applied, rejected };
}

/** Heuristic: did the RAG endpoint effectively fail to answer the question? */
export function ragFailed(answer: string): boolean {
  const a = (answer ?? "").toLowerCase();
  return (
    a.length < 12 ||
    a.includes("not sure") ||
    a.includes("couldn't find") ||
    a.includes("could not find") ||
    a.includes("does not mention") ||
    a.includes("do not mention") ||
    a.includes("not explicitly") ||
    a.includes("no information") ||
    a.includes("provide more details") ||
    a.includes("more context") ||
    a.includes("which antenna") ||
    a.includes("could you clarify") ||
    a.includes("don't have") ||
    a.includes("do not have")
  );
}

/**
 * Does the question refer to the current on-screen design? If so, RAG (which has
 * no view of the current config) can't help — route straight to the model.
 */
export function refersToCurrent(q: string): boolean {
  const s = (q ?? "").toLowerCase();
  return (
    s.includes("this antenna") || s.includes("this array") ||
    s.includes("this design") || s.includes("this configuration") ||
    s.includes("this model") || s.includes("current antenna") ||
    s.includes("current array") || s.includes("current design") ||
    s.includes("my antenna") || s.includes("my array")
  );
}

/** Minimal shape of a model response the orchestrator needs (mockable in tests). */
export interface ModelLike {
  functionCalls?: { name: string; args?: Record<string, unknown> }[];
  text?: string;
}

/** The branch the pipeline should take for a given model response + user query. */
export type PipelineAction =
  | { kind: "command"; patch: Partial<ConfigurationState>; applied: string[]; rejected: string[] }
  | { kind: "command-empty" }
  | { kind: "dialogue"; text: string }
  | { kind: "knowledge-current" }
  | { kind: "knowledge-general" };

/**
 * Core routing decision, mirroring the live handler but pure and synchronous.
 * Given what the model returned and the user's query, decide which path to take.
 */
export function decideAction(model: ModelLike, query: string): PipelineAction {
  const calls = model.functionCalls;
  if (calls && calls.length > 0) {
    const patch: Record<string, unknown> = {};
    const applied: string[] = [];
    const rejected: string[] = [];
    for (const call of calls) {
      if (call.name !== "updateConfig" || !call.args) continue;
      const v = validateToolArgs(call.args);
      Object.assign(patch, v.patch);
      applied.push(...v.applied);
      rejected.push(...v.rejected);
    }
    return applied.length > 0
      ? { kind: "command", patch: patch as Partial<ConfigurationState>, applied, rejected }
      : { kind: "command-empty" };
  }

  const text = (model.text ?? "").trim();
  if (!text || text.includes("ROUTE_TO_RAG")) {
    return refersToCurrent(query)
      ? { kind: "knowledge-current" }
      : { kind: "knowledge-general" };
  }
  return { kind: "dialogue", text };
}
