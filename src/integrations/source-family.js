import { createHash, randomUUID } from "node:crypto";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function fail(code) {
  throw new TypeError(code);
}

function record(value, fields) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field));
}

function appVersion(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}

function bytes(value) {
  if (!(value instanceof Uint8Array)) fail("SOURCE_FAMILY_BYTES_REQUIRED");
  return value;
}

function hash(value) {
  return createHash("sha256").update(bytes(value)).digest("hex");
}

function artifact(value, application, extraFields = []) {
  const fields = ["application", "version", "content_sha256", "content_bytes", ...extraFields];
  if (!record(value, fields)
    || value.application !== application
    || !appVersion(value.version)
    || typeof value.content_sha256 !== "string"
    || !HASH.test(value.content_sha256)
    || !Number.isSafeInteger(value.content_bytes)
    || value.content_bytes < 0) fail("SOURCE_FAMILY_INVALID_ARTIFACT");
  if (extraFields.includes("record_ref")
    && (typeof value.record_ref !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value.record_ref))) {
    fail("SOURCE_FAMILY_INVALID_RECORD_REF");
  }
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}

export function validateSourceFamilyReceipt(value) {
  const fields = ["schema_version", "transfer_id", "transferred_at", "relation", "bridge", "source", "destination"];
  if (!record(value, fields) || value.schema_version !== 1) fail("SOURCE_FAMILY_INVALID_RECEIPT");
  if (typeof value.transfer_id !== "string" || !ID.test(value.transfer_id)) fail("SOURCE_FAMILY_INVALID_TRANSFER_ID");
  if (typeof value.transferred_at !== "string" || !TIME.test(value.transferred_at)
    || Number.isNaN(Date.parse(value.transferred_at))
    || new Date(value.transferred_at).toISOString() !== value.transferred_at) {
    fail("SOURCE_FAMILY_INVALID_TIMESTAMP");
  }
  if (!["exact-copy", "derived"].includes(value.relation)) fail("SOURCE_FAMILY_INVALID_RELATION");
  if (!record(value.bridge, ["application", "version"])
    || value.bridge.application !== "sourcebridge"
    || !appVersion(value.bridge.version)) fail("SOURCE_FAMILY_INVALID_BRIDGE");

  const source = artifact(value.source, "sourceink");
  const destination = artifact(value.destination, "sourcetome", ["record_ref"]);
  if (value.relation === "exact-copy"
    && (source.content_sha256 !== destination.content_sha256 || source.content_bytes !== destination.content_bytes)) {
    fail("SOURCE_FAMILY_EXACT_COPY_MISMATCH");
  }

  return {
    schema_version: 1,
    transfer_id: value.transfer_id.toLowerCase(),
    transferred_at: value.transferred_at,
    relation: value.relation,
    bridge: { application: "sourcebridge", version: value.bridge.version },
    source,
    destination
  };
}

export function createSourceFamilyReceipt({ transferId = randomUUID(), transferredAt = new Date().toISOString(), bridgeVersion, sourceVersion, sourceBytes, destinationVersion, destinationRecordRef, destinationBytes, relation = "exact-copy" }) {
  const source = bytes(sourceBytes);
  const destination = bytes(destinationBytes);
  return validateSourceFamilyReceipt({
    schema_version: 1,
    transfer_id: transferId,
    transferred_at: transferredAt,
    relation,
    bridge: { application: "sourcebridge", version: bridgeVersion },
    source: {
      application: "sourceink",
      version: sourceVersion,
      content_sha256: hash(source),
      content_bytes: source.byteLength
    },
    destination: {
      application: "sourcetome",
      version: destinationVersion,
      record_ref: destinationRecordRef,
      content_sha256: hash(destination),
      content_bytes: destination.byteLength
    }
  });
}

export function verifySourceFamilyReceipt(value, { sourceBytes, destinationBytes }) {
  const receipt = validateSourceFamilyReceipt(value);
  const source = bytes(sourceBytes);
  const destination = bytes(destinationBytes);
  const mismatches = [];
  if (source.byteLength !== receipt.source.content_bytes || hash(source) !== receipt.source.content_sha256) mismatches.push("source");
  if (destination.byteLength !== receipt.destination.content_bytes || hash(destination) !== receipt.destination.content_sha256) mismatches.push("destination");
  return { valid: mismatches.length === 0, relation: receipt.relation, mismatches };
}
