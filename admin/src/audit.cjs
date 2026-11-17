const ok = (v) => v && typeof v === "object" && !Array.isArray(v);
module.exports = function validateAudit(a, id) {
  if (
    !ok(a) ||
    Object.keys(a).some(
      (k) =>
        ![
          "version",
          "batchId",
          "submissionId",
          "actor",
          "createdAt",
          "baseCommit",
          "reason",
          "branch",
          "operations",
        ].includes(k),
    ) ||
    a.version !== 2 ||
    a.batchId !== id ||
    !/^[\w-]{43}$/.test(id) ||
    !/^\d+$/.test(a.actor) ||
    !Number.isFinite(Date.parse(a.createdAt)) ||
    !/^[\w-]{1,64}$/.test(a.baseCommit || "") ||
    (a.submissionId !== undefined && !/^[\w-]{43}$/.test(a.submissionId)) ||
    a.branch !== "admin/change-" + (a.submissionId || id) ||
    !(
      a.reason === null ||
      (typeof a.reason === "string" && a.reason.length <= 500)
    ) ||
    !Array.isArray(a.operations) ||
    !a.operations.length ||
    a.operations.length > 120
  )
    throw new Error("invalid_admin_audit");
  for (const op of a.operations)
    if (
      !ok(op) ||
      Object.keys(op).some(
        (k) =>
          ![
            "operationId",
            "entity",
            "recordId",
            "action",
            "changedFields",
            "before",
            "after",
          ].includes(k),
      ) ||
      typeof op.operationId !== "string" ||
      ![
        "talent",
        "organization",
        "group",
        "anniversary",
        "song",
        "musicVideo",
        "video",
        "karaoke",
        "performance",
        "event",
        "campaign",
        "product",
        "offer",
      ].includes(op.entity) ||
      typeof op.recordId !== "string" ||
      ![
        "create",
        "edit",
        "save",
        "delete",
        "merge",
        "visibility",
        "wiki",
        "collection",
      ].includes(op.action) ||
      !Array.isArray(op.changedFields) ||
      !op.changedFields.every((f) => typeof f === "string") ||
      !(op.before === null || ok(op.before)) ||
      !(op.after === null || ok(op.after)) ||
      !Object.hasOwn(op, "before") ||
      !Object.hasOwn(op, "after")
    )
      throw new Error("invalid_admin_audit_operation");
  return true;
};
