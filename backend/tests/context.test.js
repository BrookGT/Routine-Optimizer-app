import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hourToTimeOfDay, buildContext } from "../src/utils/context.js";

describe("hourToTimeOfDay", () => {
  it("maps hours to bands", () => {
    assert.equal(hourToTimeOfDay(8), "morning");
    assert.equal(hourToTimeOfDay(14), "afternoon");
    assert.equal(hourToTimeOfDay(20), "evening");
    assert.equal(hourToTimeOfDay(2), "night");
  });
});

describe("buildContext", () => {
  it("marks Saturday as weekend", () => {
    const ctx = buildContext(new Date("2026-05-30T10:00:00"));
    assert.equal(ctx.isWeekend, true);
    assert.equal(ctx.dayName, "Saturday");
    assert.equal(ctx.timeOfDay, "morning");
  });

  it("flags late night hours", () => {
    const ctx = buildContext(new Date("2026-05-29T01:30:00"));
    assert.equal(ctx.isLateNight, true);
    assert.equal(ctx.timeOfDay, "night");
  });
});
