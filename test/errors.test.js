import assert from "node:assert/strict";
import test from "node:test";
import { mapGlabError } from "../dist/src/errors.js";

test("404 Project Not Found maps to REPO_NOT_FOUND", () => {
  assert.equal(
    mapGlabError("404 Project Not Found", 1).code,
    "REPO_NOT_FOUND",
  );
});

test("a real HTTP 401 maps to AUTH_REQUIRED", () => {
  assert.equal(mapGlabError("401 Unauthorized", 1).code, "AUTH_REQUIRED");
});

test("an invalid token maps to AUTH_REQUIRED", () => {
  assert.equal(
    mapGlabError("error: token is invalid or expired", 1).code,
    "AUTH_REQUIRED",
  );
});

test("403 maps to FORBIDDEN", () => {
  assert.equal(mapGlabError("403 Forbidden", 1).code, "FORBIDDEN");
});

test("a missing merge request maps to NOT_FOUND", () => {
  const err = mapGlabError("404 MergeRequest Not Found", 1);
  assert.equal(err.code, "NOT_FOUND");
});

test("a conflict maps to VALIDATION_ERROR", () => {
  const err = mapGlabError("409 Conflict: merge request already exists", 1);
  assert.equal(err.code, "VALIDATION_ERROR");
});

test("unrecognized failures preserve the stderr excerpt under UNKNOWN", () => {
  const err = mapGlabError("error: something unexpected\nmore detail", 9);
  assert.equal(err.code, "UNKNOWN");
  assert.match(err.message, /something unexpected/);
});

test("token values in stderr are redacted from the surfaced message", () => {
  const err = mapGlabError("error: failed with token=supersecret detail", 9);
  assert.doesNotMatch(err.message, /supersecret/);
});
