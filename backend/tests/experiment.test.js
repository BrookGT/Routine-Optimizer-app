import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getVariantForUser,
  getBlendWeightsForVariant,
  isExperimentActive,
  VARIANT_A,
  VARIANT_B,
} from "../src/utils/experiment.js";

describe("getVariantForUser", () => {
  it("is deterministic for the same user", () => {
    const a = getVariantForUser("user-abc-123");
    const b = getVariantForUser("user-abc-123");
    assert.equal(a, b);
    assert.ok(a === VARIANT_A || a === VARIANT_B);
  });

  it("can assign different users to different variants", () => {
    const variants = new Set(
      Array.from({ length: 50 }, (_, i) => getVariantForUser(`user-${i}`)),
    );
    assert.equal(variants.size, 2);
  });
});

describe("getBlendWeightsForVariant", () => {
  it("returns production weights for variant A", () => {
    const w = getBlendWeightsForVariant(VARIANT_A);
    assert.equal(w.ruleBlendWeight, 0.7);
    assert.equal(w.modelBlendWeight, 0.3);
  });

  it("returns experiment weights for variant B by default", () => {
    const w = getBlendWeightsForVariant(VARIANT_B);
    assert.equal(w.ruleBlendWeight, 0.6);
    assert.equal(w.modelBlendWeight, 0.4);
  });
});

describe("isExperimentActive", () => {
  const prev = process.env.EXPERIMENT_ACTIVE;

  afterEach(() => {
    if (prev === undefined) delete process.env.EXPERIMENT_ACTIVE;
    else process.env.EXPERIMENT_ACTIVE = prev;
  });

  it("is false unless env is set", () => {
    delete process.env.EXPERIMENT_ACTIVE;
    assert.equal(isExperimentActive(), false);
  });

  it("is true when EXPERIMENT_ACTIVE=true", () => {
    process.env.EXPERIMENT_ACTIVE = "true";
    assert.equal(isExperimentActive(), true);
  });
});
