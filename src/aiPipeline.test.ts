/**
 * Integration tests for the AI assistant pipeline (aiPipeline.ts).
 *
 * These exercise the orchestration of the critical AI paths WITHOUT calling the
 * live Gemini or Flowise services: the model response is stubbed, so the routing,
 * schema validation, and fallback decisions are fully reproducible.
 *
 * Covered critical paths:
 *   - a natural-language command routes to a validated tool call (COMMAND)
 *   - tool-call arguments outside the schema are rejected (SAFETY)
 *   - a theory question routes to RAG (KNOWLEDGE)
 *   - a failed RAG answer triggers the fallback heuristic (FALLBACK)
 *   - a follow-up about the current design routes to the context-aware path
 *   - an incomplete request yields clarifying dialogue, not a guess
 *
 * Run with:  npm run test:unit
 */

import { describe, it, expect } from "vitest";
import {
  decideAction,
  validateToolArgs,
  ragFailed,
  refersToCurrent,
  type ModelLike,
} from "./aiPipeline";

// A model response that made a tool call.
const withToolCall = (args: Record<string, unknown>): ModelLike => ({
  functionCalls: [{ name: "updateConfig", args }],
});
// A model response that returned only text (no tool call).
const withText = (text: string): ModelLike => ({ text });

describe("COMMAND path — natural language → validated tool call", () => {
  it("routes a valid configuration command to a config patch", () => {
    const action = decideAction(
      withToolCall({ type: "Yagi-Uda", geometry: "circular", elements: 6, activeTab: "2d" }),
      "Build a 2D circular array with Yagi-Uda antennas and 6 elements",
    );
    expect(action.kind).toBe("command");
    if (action.kind === "command") {
      expect(action.patch).toMatchObject({
        type: "Yagi-Uda",
        geometry: "circular",
        elements: 6,
        activeTab: "2d",
      });
      expect(action.applied.length).toBe(4);
      expect(action.rejected).toHaveLength(0);
    }
  });

  it("applies a single-parameter tweak", () => {
    const action = decideAction(withToolCall({ freq: 2400 }), "set the frequency to 2.4 GHz");
    expect(action.kind).toBe("command");
    if (action.kind === "command") expect(action.patch).toEqual({ freq: 2400 });
  });
});

describe("SAFETY path — tool arguments are validated against the schema", () => {
  it("rejects keys that are not in the allowed schema", () => {
    const { patch, applied, rejected } = validateToolArgs({
      elements: 4,
      isAdmin: true, // not a real config field
      __proto__: {}, // must never be written through
    });
    expect(patch).toEqual({ elements: 4 });
    expect(applied).toContain("elements = 4");
    expect(rejected).toContain("isAdmin");
  });

  it("rejects invalid enum values", () => {
    const { patch, rejected } = validateToolArgs({ geometry: "hexagonal" });
    expect(patch).toEqual({});
    expect(rejected).toContain("geometry");
  });

  it("rejects wrong types for numeric fields", () => {
    const { patch, rejected } = validateToolArgs({ elements: "eight" });
    expect(patch).toEqual({});
    expect(rejected).toContain("elements");
  });

  it("rejects an unknown antenna type but keeps valid fields", () => {
    const { patch, rejected } = validateToolArgs({ type: "Death Ray", elements: 3 });
    expect(patch).toEqual({ elements: 3 });
    expect(rejected).toContain("type");
  });

  it("a command with only invalid params does not mutate state", () => {
    const action = decideAction(withToolCall({ bogus: 1, geometry: "octagon" }), "do something weird");
    expect(action.kind).toBe("command-empty");
  });
});

describe("KNOWLEDGE path — theory questions route to RAG", () => {
  it("routes a general theory question to the RAG (knowledge-general) branch", () => {
    const action = decideAction(withText("ROUTE_TO_RAG"), "What is antenna gain?");
    expect(action.kind).toBe("knowledge-general");
  });

  it("routes an empty model response to RAG as well", () => {
    const action = decideAction(withText(""), "Explain array factor");
    expect(action.kind).toBe("knowledge-general");
  });
});

describe("FALLBACK path — a failed RAG answer is detected", () => {
  it("flags a variety of 'I don't know' style answers", () => {
    expect(ragFailed("Hmm, I'm not sure.")).toBe(true);
    expect(ragFailed("The provided context does not mention that.")).toBe(true);
    expect(ragFailed("Could you provide more details about the antenna?")).toBe(true);
    expect(ragFailed("")).toBe(true);
  });

  it("accepts a substantive answer as successful", () => {
    expect(
      ragFailed("Antenna gain measures how effectively an antenna directs radio energy in a given direction, expressed in dBi."),
    ).toBe(false);
  });
});

describe("CONTEXT path — follow-ups about the current design", () => {
  it("routes 'this antenna' questions to the context-aware branch", () => {
    const action = decideAction(withText("ROUTE_TO_RAG"), "What is the gain of this antenna?");
    expect(action.kind).toBe("knowledge-current");
  });

  it("detects several current-design phrasings", () => {
    expect(refersToCurrent("what is the gain of this array?")).toBe(true);
    expect(refersToCurrent("describe my antenna")).toBe(true);
    expect(refersToCurrent("how does the current design perform")).toBe(true);
    expect(refersToCurrent("what is a dipole")).toBe(false);
  });
});

describe("DIALOGUE path — incomplete requests ask instead of guessing", () => {
  it("shows the model's clarifying question rather than acting", () => {
    const clarifying =
      "Which antenna element would you like to use?\n- Dipole\n- Yagi-Uda\n- Helical";
    const action = decideAction(withText(clarifying), "I want to design a circular array");
    expect(action.kind).toBe("dialogue");
    if (action.kind === "dialogue") expect(action.text).toContain("Which antenna element");
  });
});
