import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { findBrainTranscript } from "../../src/sources/brain/index.js";

describe("brain store transcript discovery", () => {
  it("finds and parses unencrypted transcript_full.jsonl from brain store", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-test-"));
    const convId = "test-conv-1234-5678";
    const brainLogDir = path.join(tmpDir, "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(brainLogDir, { recursive: true });

    const testTranscript = [
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Test prompt" }),
      JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", content: "Test response" })
    ].join("\n");

    fs.writeFileSync(path.join(brainLogDir, "transcript_full.jsonl"), testTranscript, "utf8");

    const res = findBrainTranscript(convId, { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 2);
    assert.equal((res.steps[0] as { content: string }).content, "Test prompt");
    assert.equal((res.steps[1] as { content: string }).content, "Test response");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds and concatenates multi-chunk jsonl files when transcript_full is absent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-chunk-test-"));
    const convId = "test-chunk-conv-9876";
    const chunkDir = path.join(tmpDir, "brain", convId, ".system_generated", "logs", "chunks", "transcript");
    fs.mkdirSync(chunkDir, { recursive: true });

    fs.writeFileSync(
      path.join(chunkDir, "00000000.jsonl"),
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Chunk 0" }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(chunkDir, "00000001.jsonl"),
      JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", content: "Chunk 1" }) + "\n",
      "utf8"
    );

    const res = findBrainTranscript(convId, { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 2);
    assert.equal((res.steps[0] as { content: string }).content, "Chunk 0");
    assert.equal((res.steps[1] as { content: string }).content, "Chunk 1");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no brain transcript exists for conversation", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-test-empty-"));
    const res = findBrainTranscript("non-existent-conv-id", { dataDir: tmpDir });
    assert.equal(res, null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds and parses overview.txt as fallback when full and chunk transcripts are absent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-overview-test-"));
    const convId = "test-conv-overview-1111";
    const brainLogDir = path.join(tmpDir, "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(brainLogDir, { recursive: true });

    const testOverview = [
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Overview prompt" }),
      JSON.stringify({ step_index: 4, type: "PLANNER_RESPONSE", content: "Overview response" })
    ].join("\n");

    fs.writeFileSync(path.join(brainLogDir, "overview.txt"), testOverview, "utf8");

    const res = findBrainTranscript(convId, { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 2);
    assert.equal((res.steps[0] as { content: string }).content, "Overview prompt");
    assert.equal((res.steps[1] as { content: string }).content, "Overview response");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds transcript in workspace .antigravity/brain directory", () => {
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-ws-brain-test-"));
    const convId = "test-ws-conv-2222";
    const brainLogDir = path.join(wsDir, ".antigravity", "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(brainLogDir, { recursive: true });

    const testTranscript = JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Workspace prompt" });
    fs.writeFileSync(path.join(brainLogDir, "transcript.jsonl"), testTranscript, "utf8");

    const res = findBrainTranscript(convId, { cwd: wsDir, dataDir: "/nonexistent" });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 1);
    assert.equal((res.steps[0] as { content: string }).content, "Workspace prompt");

    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it("prefers chunked transcript over overview.txt when both are present", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-precedence-test-"));
    const convId = "test-precedence-conv-3333";
    const logsDir = path.join(tmpDir, "brain", convId, ".system_generated", "logs");
    const chunkDir = path.join(logsDir, "chunks", "transcript_full");
    fs.mkdirSync(chunkDir, { recursive: true });

    // overview.txt has only 1 summarized step
    fs.writeFileSync(
      path.join(logsDir, "overview.txt"),
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Overview summary only" }) + "\n",
      "utf8"
    );

    // chunk files have full 2 steps
    fs.writeFileSync(
      path.join(chunkDir, "chunk_1.jsonl"),
      JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Full Chunk Step 0" }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(chunkDir, "chunk_2.jsonl"),
      JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", content: "Full Chunk Step 1" }) + "\n",
      "utf8"
    );

    const res = findBrainTranscript(convId, { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 2);
    assert.equal((res.steps[0] as { content: string }).content, "Full Chunk Step 0");
    assert.equal((res.steps[1] as { content: string }).content, "Full Chunk Step 1");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sorts chunk files numerically (chunk_2 before chunk_10)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-numeric-test-"));
    const convId = "test-numeric-conv-4444";
    const chunkDir = path.join(tmpDir, "brain", convId, ".system_generated", "logs", "chunks", "transcript");
    fs.mkdirSync(chunkDir, { recursive: true });

    fs.writeFileSync(
      path.join(chunkDir, "chunk_2.jsonl"),
      JSON.stringify({ step_index: 2, type: "USER_INPUT", content: "Step 2" }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(chunkDir, "chunk_10.jsonl"),
      JSON.stringify({ step_index: 10, type: "USER_INPUT", content: "Step 10" }) + "\n",
      "utf8"
    );

    const res = findBrainTranscript(convId, { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 2);
    assert.equal((res.steps[0] as { content: string }).content, "Step 2");
    assert.equal((res.steps[1] as { content: string }).content, "Step 10");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles zero-step transcript_full.jsonl file cleanly", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-zero-test-"));
    const convId = "test-zero-conv-5555";
    const brainLogDir = path.join(tmpDir, "brain", convId, ".system_generated", "logs");
    fs.mkdirSync(brainLogDir, { recursive: true });

    fs.writeFileSync(path.join(brainLogDir, "transcript_full.jsonl"), "", "utf8");

    const res = findBrainTranscript(convId, { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles case-insensitive conversation ID matching in brain store", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-case-brain-test-"));
    const convId = "abcdef-1234-5678";
    const brainLogDir = path.join(tmpDir, "brain", convId.toLowerCase(), ".system_generated", "logs");
    fs.mkdirSync(brainLogDir, { recursive: true });

    const testTranscript = JSON.stringify({ step_index: 0, type: "USER_INPUT", content: "Case test prompt" });
    fs.writeFileSync(path.join(brainLogDir, "transcript.jsonl"), testTranscript, "utf8");

    const res = findBrainTranscript(convId.toUpperCase(), { dataDir: tmpDir });
    assert.ok(res !== null);
    assert.equal(res.steps.length, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
