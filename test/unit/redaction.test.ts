import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets, redactObject } from "../../src/privacy/redact.js";
import { redactPathsInText, redactPathsInObject } from "../../src/privacy/paths.js";

describe("redaction", () => {
  it("redacts GitHub personal access tokens", () => {
    const input = "Use token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB to access the repo.";
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 1);
    assert.equal(text, "Use token [REDACTED] to access the repo.");
  });

  it("redacts AWS access key IDs", () => {
    const input = "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 1);
    assert.ok(!text.includes("AKIAIOSFODNN7EXAMPLE"));
    assert.ok(text.includes("[REDACTED]"));
  });

  it("redacts OpenAI API keys", () => {
    const input = "sk-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF";
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 1);
    assert.equal(text, "[REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    const input = "Authorization: Bearer abcdef1234567890abcdef1234567890";
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 1);
    assert.equal(text, "Authorization: Bearer [REDACTED]");
  });

  it("redacts private keys", () => {
    const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+
...
-----END RSA PRIVATE KEY-----`;
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 1);
    assert.equal(text, "[REDACTED]");
  });

  it("redacts key-value tokens in configs", () => {
    const input = 'API_KEY="mysecretkey1234567890"';
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 1);
    assert.equal(text, 'API_KEY="[REDACTED]"');
  });

  it("does not over-redact normal words (false positive check)", () => {
    const input = "The token is ready. Please test the sky and check your tasks.";
    const { text, redactedCount } = redactSecrets(input);
    assert.equal(redactedCount, 0);
    assert.equal(text, input);
  });

  it("redactObject recursively redacts objects and arrays", () => {
    const payload = {
      user: "Alice",
      nested: {
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
        normal: "regular string"
      },
      list: ["AKIAIOSFODNN7EXAMPLE", "plain item"]
    };

    const { value, redactedCount } = redactObject(payload);
    assert.equal(redactedCount, 2);
    assert.equal(value.nested.token, "[REDACTED]");
    assert.equal(value.nested.normal, "regular string");
    assert.equal(value.list[0], "[REDACTED]");
  });

  it("redactPathsInText replaces workspace and home paths with placeholders", () => {
    const ws = "D:/projects/ticktick";
    const home = "C:/Users/deba";
    const input = "File at D:\\projects\\ticktick\\src\\auth.ts and C:\\Users\\deba\\.ssh\\id_rsa";

    const redacted = redactPathsInText(input, ws, home);
    assert.ok(redacted.includes("<workspace>"));
    assert.ok(redacted.includes("<home>"));
    assert.ok(!redacted.includes("D:\\projects\\ticktick"));
    assert.ok(!redacted.includes("C:\\Users\\deba"));
  });

  it("redactPathsInObject redacts paths in deeply nested structures", () => {
    const ws = "D:/projects/ticktick";
    const obj = {
      path: "D:\\projects\\ticktick\\package.json",
      items: ["D:\\projects\\ticktick\\src\\index.ts"]
    };

    const result = redactPathsInObject(obj, ws);
    assert.ok(result.path.includes("<workspace>"));
    assert.ok(result.items[0].includes("<workspace>"));
  });
});
