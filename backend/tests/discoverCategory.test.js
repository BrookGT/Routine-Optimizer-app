import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDiscoverFilterKey,
  placeMatchesDiscoverKey,
  getAllowedInternalTypesForDiscover,
} from "../src/utils/discoverCategory.js";

describe("normalizeDiscoverFilterKey", () => {
  it("normalizes aliases to canonical keys", () => {
    assert.equal(normalizeDiscoverFilterKey("cafes"), "cafe");
    assert.equal(normalizeDiscoverFilterKey("gyms"), "gym");
  });

  it("returns null for unknown filters", () => {
    assert.equal(normalizeDiscoverFilterKey("museum"), null);
  });
});

describe("placeMatchesDiscoverKey", () => {
  it("matches coffee under cafe discover chip", () => {
    assert.equal(
      placeMatchesDiscoverKey({ type: "coffee" }, "cafe"),
      true,
    );
  });

  it("rejects restaurant type for gym chip", () => {
    assert.equal(
      placeMatchesDiscoverKey({ type: "restaurant" }, "gym"),
      false,
    );
  });
});

describe("getAllowedInternalTypesForDiscover", () => {
  it("returns empty set for event (no place types)", () => {
    const allowed = getAllowedInternalTypesForDiscover("event");
    assert.equal(allowed.size, 0);
  });
});
