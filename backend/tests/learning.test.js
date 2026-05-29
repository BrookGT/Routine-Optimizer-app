import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  interactionAgeDecayWeight,
  detectBehaviorShift,
  balanceLearningSignals,
} from "../src/utils/learning.js";

describe("interactionAgeDecayWeight", () => {
  const now = new Date("2026-05-29T12:00:00Z");

  it("returns 1.0 for interactions within 24 hours", () => {
    const recent = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    assert.equal(interactionAgeDecayWeight(recent, now), 1.0);
  });

  it("returns 0.7 for interactions between 1 and 7 days", () => {
    const threeDays = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(interactionAgeDecayWeight(threeDays, now), 0.7);
  });

  it("returns 0.4 for interactions older than 7 days", () => {
    const old = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(interactionAgeDecayWeight(old, now), 0.4);
  });
});

describe("detectBehaviorShift", () => {
  it("returns false when sample is too small", () => {
    const interactions = Array.from({ length: 10 }, (_, i) => ({
      score: 1,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }));
    assert.equal(detectBehaviorShift(interactions).behaviorShiftDetected, false);
  });

  it("detects shift when recent mean diverges from history", () => {
    const interactions = [];
    for (let i = 0; i < 20; i++) {
      interactions.push({
        score: i < 10 ? 3 : -1,
        createdAt: new Date(2026, 0, 20 - i).toISOString(),
      });
    }
    const result = detectBehaviorShift(interactions);
    assert.equal(result.behaviorShiftDetected, true);
  });
});

describe("balanceLearningSignals", () => {
  it("caps each positive signal at 40% of total", () => {
    const { longTerm, recent, session } = balanceLearningSignals(10, 10, 10, 0.4);
    const sum = Math.max(0, longTerm) + Math.max(0, recent) + Math.max(0, session);
    assert.ok(longTerm <= 0.4 * sum + 1e-6);
    assert.ok(recent <= 0.4 * sum + 1e-6);
    assert.ok(session <= 0.4 * sum + 1e-6);
  });

  it("preserves negative session penalty", () => {
    const out = balanceLearningSignals(1, 1, -2, 0.4);
    assert.ok(out.session < 0);
  });
});
