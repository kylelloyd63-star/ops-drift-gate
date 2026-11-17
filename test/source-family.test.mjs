import assert from "node:assert/strict";
import test from "node:test";
import { createSourceFamilyReceipt, validateSourceFamilyReceipt, verifySourceFamilyReceipt } from "../src/index.js";

const sourceBytes = Buffer.from("selected SourceInk page");
const destinationBytes = Buffer.from("selected SourceInk page");
const baseReceipt = () => createSourceFamilyReceipt({
  transferId: "4e2ebd90-7383-4f20-8fa4-b69a7a415779",
  transferredAt: "2026-11-16T12:00:00.000Z",
  bridgeVersion: "1.2.3",
  sourceVersion: "2.0.0",
  sourceBytes,
  destinationVersion: "3.0.0",
  destinationRecordRef: "local-record-123",
  destinationBytes
});

test("Source Family exact-copy receipt validates and verifies only byte metadata", () => {
  const receipt = baseReceipt();
  assert.equal(receipt.relation, "exact-copy");
  assert.deepEqual(verifySourceFamilyReceipt(receipt, { sourceBytes, destinationBytes }), {
    valid: true,
    relation: "exact-copy",
    mismatches: []
  });
  assert.equal(JSON.stringify(receipt).includes("selected SourceInk page"), false);
  assert.equal(JSON.stringify(receipt).includes("path"), false);
});

test("Source Family receipt rejects mismatched exact copies and unexpected content fields", () => {
  const receipt = baseReceipt();
  assert.throws(() => validateSourceFamilyReceipt({
    ...receipt,
    destination: {
      ...receipt.destination,
      content_sha256: "0".repeat(64)
    }
  }), /SOURCE_FAMILY_EXACT_COPY_MISMATCH/);
  assert.throws(() => validateSourceFamilyReceipt({
    ...receipt,
    page_title: "private journal title"
  }), /SOURCE_FAMILY_INVALID_RECEIPT/);
});

test("Source Family derived transfer verifies both sides independently", () => {
  const derivedBytes = Buffer.from("normalized SourceToMe artifact");
  const receipt = createSourceFamilyReceipt({
    transferId: "4e2ebd90-7383-4f20-8fa4-b69a7a415779",
    transferredAt: "2026-11-16T12:00:00.000Z",
    bridgeVersion: "1.2.3",
    sourceVersion: "2.0.0",
    sourceBytes,
    destinationVersion: "3.0.0",
    destinationRecordRef: "local-record-123",
    destinationBytes: derivedBytes,
    relation: "derived"
  });
  assert.deepEqual(verifySourceFamilyReceipt(receipt, { sourceBytes, destinationBytes: derivedBytes }), {
    valid: true,
    relation: "derived",
    mismatches: []
  });
  assert.deepEqual(verifySourceFamilyReceipt(receipt, { sourceBytes, destinationBytes }), {
    valid: false,
    relation: "derived",
    mismatches: ["destination"]
  });
});
