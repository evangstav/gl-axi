import assert from "node:assert/strict";
import test from "node:test";
import { parseRemoteUrl } from "../dist/src/context.js";

test("parses an https GitLab origin into host + project path", () => {
  const r = parseRemoteUrl("https://gitlab.swpd/genai-data-intelligence/taxis.git");
  assert.deepEqual(r, {
    host: "gitlab.swpd",
    projectPath: "genai-data-intelligence/taxis",
  });
});

test("parses an https origin with an embedded user", () => {
  const r = parseRemoteUrl("https://oauth2@gitlab.swpd/group/repo.git");
  assert.deepEqual(r, { host: "gitlab.swpd", projectPath: "group/repo" });
});

test("parses an scp-style ssh origin", () => {
  const r = parseRemoteUrl("git@gitlab.swpd:genai-data-intelligence/taxis.git");
  assert.deepEqual(r, {
    host: "gitlab.swpd",
    projectPath: "genai-data-intelligence/taxis",
  });
});

test("parses an ssh:// origin with a port", () => {
  const r = parseRemoteUrl("ssh://git@gitlab.swpd:2222/group/repo.git");
  assert.deepEqual(r, { host: "gitlab.swpd", projectPath: "group/repo" });
});

test("preserves multi-segment subgroup paths", () => {
  const r = parseRemoteUrl("https://gitlab.swpd/top/sub/deep/repo.git");
  assert.deepEqual(r, { host: "gitlab.swpd", projectPath: "top/sub/deep/repo" });
});

test("handles a URL without a .git suffix", () => {
  const r = parseRemoteUrl("https://gitlab.com/group/repo");
  assert.deepEqual(r, { host: "gitlab.com", projectPath: "group/repo" });
});

test("returns undefined for a non-GitLab-shaped value", () => {
  assert.equal(parseRemoteUrl("not a url"), undefined);
});
