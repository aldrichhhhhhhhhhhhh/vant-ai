import test from "node:test";
import assert from "node:assert/strict";
import { classifyFinishReason } from "../lib/vantCompletion.js";

test("accepts an explicit normal stop as complete", () => {
  assert.equal(classifyFinishReason("stop"), "complete");
});

test("identifies output-token truncation", () => {
  assert.equal(classifyFinishReason("length"), "truncated");
});

test("does not treat missing finish metadata as completion", () => {
  assert.equal(classifyFinishReason(null), "unknown");
  assert.equal(classifyFinishReason(undefined), "unknown");
  assert.equal(classifyFinishReason(""), "unknown");
});

test("does not treat content filtering as normal completion", () => {
  assert.equal(classifyFinishReason("content_filter"), "filtered");
});

test("does not silently accept an unknown provider finish reason", () => {
  assert.equal(classifyFinishReason("unexpected"), "unknown");
});
