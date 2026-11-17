// Detached client state; never put credentials or complete master snapshots here.
export class Workspace {
  constructor(api, notify, delay = 5000) {
    this.api = api;
    this.notify = notify;
    this.delay = delay;
    this.operations = [];
    this.revision = 0;
    this.state = "loading";
    this.undoStack = [];
    this.redoStack = [];
    this.generation = 0;
  }
  get dirty() {
    return ["unsaved", "saving", "failed", "conflict"].includes(this.state);
  }
  emit() {
    this.notify?.(this);
  }
  async load() {
    clearTimeout(this.timer);
    const { workspace } = await this.api("/api/workspace");
    this.operations = (workspace?.operations || []).map(
      ({ validationState, ...op }) => op,
    );
    this.revision = workspace?.revision || 0;
    this.expiresAt = workspace?.expiresAt;
    this.updatedAt = workspace?.updatedAt;
    this.state = "saved";
    this.undoStack = [];
    this.redoStack = [];
    this.generation++;
    this.emit();
  }
  replace(operations) {
    operations = operations.filter(
      (o) =>
        o.before === null ||
        JSON.stringify(o.before) !== JSON.stringify(o.value),
    );
    if (JSON.stringify(operations) === JSON.stringify(this.operations)) return;
    this.undoStack.push(structuredClone(this.operations));
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
    this.operations = structuredClone(operations);
    this.changed();
  }
  upsert(operation) {
    const next = structuredClone(this.operations),
      i = next.findIndex(
        (o) =>
          o.key === operation.key ||
          (o.id && o.entity === operation.entity && o.id === operation.id),
      );
    if (i < 0) next.push(operation);
    else
      next[i] = {
        ...operation,
        key: next[i].key,
        before: next[i].before,
        baseCommit: next[i].baseCommit,
      };
    this.replace(next);
  }
  changed() {
    this.generation++;
    clearTimeout(this.timer);
    // CAS conflicts require explicit reload; no silent retry with a newer revision.
    if (this.state !== "conflict") {
      this.state = "unsaved";
      this.timer = setTimeout(() => this.save().catch(() => {}), this.delay);
      this.timer?.unref?.();
    }
    this.emit();
  }
  history(direction) {
    const from = direction === "undo" ? this.undoStack : this.redoStack,
      to = direction === "undo" ? this.redoStack : this.undoStack;
    if (!from.length) return;
    to.push(structuredClone(this.operations));
    this.operations = from.pop();
    this.changed();
  }
  async flush() {
    for (let attempt = 0; attempt < 3 && this.state !== "saved"; attempt++)
      await this.save();
    if (this.state !== "saved")
      throw new Error(
        "下書きの保存が完了していません。もう一度保存してください。",
      );
  }
  async save() {
    clearTimeout(this.timer);
    if (this.saving) return this.saving;
    if (this.state === "conflict")
      throw new Error(
        "別タブの変更があります。入力を確認して再読み込みしてください。",
      );
    if (this.state === "saved") return;
    const generation = this.generation,
      operations = structuredClone(this.operations);
    this.state = "saving";
    this.emit();
    this.saving = (async () => {
      try {
        const { workspace } = await this.api("/api/workspace", "PUT", {
          protocol: 1,
          revision: this.revision,
          operations,
        });
        this.revision = workspace.revision;
        this.expiresAt = workspace.expiresAt;
        this.updatedAt = workspace.updatedAt;
        this.state = generation === this.generation ? "saved" : "unsaved";
      } catch (e) {
        this.state =
          e.code === "workspace_revision_conflict" ? "conflict" : "failed";
        this.error = e.message;
        throw e;
      } finally {
        this.saving = null;
        this.emit();
        if (this.state === "unsaved")
          this.timer = setTimeout(
            () => this.save().catch(() => {}),
            this.delay,
          );
      }
    })();
    return this.saving;
  }
}

export function withoutSubmitted(operations, submitted) {
  return operations.filter(
    (o) =>
      !submitted.some(
        (v) =>
          v.entity === o.entity &&
          (v.key ? v.key === o.key : Boolean(v.id) && v.id === o.id) &&
          JSON.stringify(v.value) === JSON.stringify(o.value),
      ),
  );
}

// Shared by the client selector and the server validator; never resolve names as IDs.
export function operationDependencies(operations) {
  const fields = new Set([
      "talentIds",
      "organizationIds",
      "organizationId",
      "groupIds",
      "songId",
      "youtubeId",
      "videoIds",
      "karaokeId",
      "productId",
      "campaignId",
      "reference",
    ]),
    result = {};
  function scan(value, field, set) {
    if (typeof value === "string" && value.startsWith("@") && fields.has(field))
      set.add(value.slice(1));
    else if (Array.isArray(value)) value.forEach((v) => scan(v, field, set));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) scan(v, k, set);
  }
  for (const op of operations) {
    const keys = new Set();
    scan(op.value, "", keys);
    scan(op.parent, "", keys);
    if (op.entity === "product" && op.parent?.entity === "campaign")
      for (const offer of operations.filter(
        (o) =>
          o.entity === "offer" &&
          o.value.productId === (op.id || "@" + op.key) &&
          o.value.campaignId === op.parent.reference,
      ))
        keys.add(offer.key);
    result[op.key] = [...keys];
  }
  return result;
}
