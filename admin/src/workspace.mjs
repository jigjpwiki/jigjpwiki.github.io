import { fail, random, seal, open } from "./security.mjs";
import { forms } from "./model.mjs";
export const workspaceLimits = { bytes: 524288, operations: 120, days: 30 };
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const dangerous =
  /(?:token|secret|csrf|password|authorization|session_key|api_key)|^(?:__proto__|prototype|constructor|session)$/i;
function safe(value, depth = 0) {
  if (depth > 24) fail(400, "workspace_depth");
  if (Array.isArray(value)) {
    for (const v of value) safe(v, depth + 1);
  } else if (object(value))
    for (const [k, v] of Object.entries(value)) {
      if (dangerous.test(k)) fail(400, "workspace_sensitive_field");
      safe(v, depth + 1);
    }
}
// Saving incomplete data is permitted. Saving never validates or publishes a master.
// Only editor record fields may enter storage, never session or transport metadata.
export function workspaceOperations(values) {
  if (!Array.isArray(values) || values.length > workspaceLimits.operations)
    fail(413, "workspace_operation_limit");
  const keys = new Set(),
    subjects = new Set();
  return values.map((op) => {
    if (
      !object(op) ||
      Object.keys(op).some(
        (k) =>
          ![
            "key",
            "entity",
            "id",
            "baseCommit",
            "before",
            "value",
            "parent",
          ].includes(k),
      )
    )
      fail(400, "workspace_operation");
    if (
      op.parent &&
      (!object(op.parent) ||
        Object.keys(op.parent).some(
          (k) => !["entity", "reference"].includes(k),
        ) ||
        !["campaign", "product", "karaoke"].includes(op.parent.entity) ||
        !/^[\w@-]{1,81}$/.test(op.parent.reference || ""))
    )
      fail(400, "workspace_parent");
    const schema = forms[op.entity] || forms.content.schemas[op.entity];
    if (
      !schema?.properties ||
      !/^[a-z][a-z0-9-]{0,79}$/.test(op.key || "") ||
      keys.has(op.key)
    )
      fail(400, "workspace_operation");
    keys.add(op.key);
    if (
      typeof op.baseCommit !== "string" ||
      !/^[\w-]{1,64}$/.test(op.baseCommit)
    )
      fail(400, "workspace_baseline");
    if (
      op.id !== undefined &&
      (typeof op.id !== "string" || !/^[\w-]{1,80}$/.test(op.id))
    )
      fail(400, "workspace_identity");
    const subject = op.entity + ":" + (op.id || "@" + op.key);
    if (subjects.has(subject)) fail(400, "workspace_duplicate_record");
    subjects.add(subject);
    for (const [name, record] of Object.entries({
      before: op.before,
      value: op.value,
    })) {
      if (record === null && name === "before") continue;
      if (
        !object(record) ||
        Object.keys(record).some((k) => !Object.hasOwn(schema.properties, k))
      )
        fail(400, "workspace_record_fields");
      safe(record);
    }
    if (Boolean(op.id) !== Boolean(op.before)) fail(400, "workspace_identity");
    const field = op.entity === "video" ? "youtubeId" : "id";
    if (op.before && op.id !== op.before[field])
      fail(400, "workspace_identity");
    if (op.before && op.value[field] !== op.before[field])
      fail(400, "workspace_identity");
    if (!op.before && op.entity !== "video" && op.value.id !== undefined)
      fail(400, "workspace_identity");
    return { ...structuredClone(op), validationState: "unchecked" };
  });
}
export class WorkspaceStore {
  constructor(store, secret) {
    this.store = store;
    this.secret = secret;
  }
  async get(owner) {
    const stored = await this.store.get("workspace-v1:" + owner);
    if (!stored) return null;
    const w = await open(stored.encrypted, this.secret);
    if (w.expiresAt <= Date.now()) return null;
    if (w.protocol !== 1 || w.ownerId !== owner)
      fail(409, "workspace_protocol");
    return w;
  }
  async save(owner, input) {
    if (
      !object(input) ||
      Object.keys(input).some(
        (k) => !["protocol", "revision", "operations"].includes(k),
      ) ||
      input.protocol !== 1 ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0
    )
      fail(400, "workspace_protocol");
    const previous = await this.get(owner);
    if ((previous?.revision || 0) !== input.revision)
      fail(409, "workspace_revision_conflict");
    const operations = workspaceOperations(input.operations),
      now = Date.now();
    if (
      new TextEncoder().encode(JSON.stringify(operations)).length >
      workspaceLimits.bytes - 2048
    )
      fail(413, "workspace_size_limit");
    const w = {
      protocol: 1,
      workspaceId: previous?.workspaceId || random(),
      ownerId: owner,
      revision: input.revision + 1,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      expiresAt: now + workspaceLimits.days * 86400000,
      status: "draft",
      operations,
    };
    // The mutation is atomic inside the caller's Durable Object concurrency lock.
    await this.store.put(
      "workspace-v1:" + owner,
      { encrypted: await seal(w, this.secret) },
      w.expiresAt,
    );
    return w;
  }
}
