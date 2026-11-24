import { resolveRefs } from "./content-plan.mjs";
import { entities, recordAt, threeWay } from "./submission-plan.mjs";
import { workspaceOperations } from "./workspace.mjs";

// A recovery baseline must be the candidate commit proven to be on main.
// Using today's records as the baseline would hide later editors' changes.
export function recoverAppliedGroup(saved, submitted, job, published) {
  if (job.mainConfirmed !== true || published.sha !== job.commit) return null;
  const previous = new Map(submitted.map((op) => [op.key, op]));
  const current = new Map(saved.map((op) => [op.key, op]));
  const created = new Map(job.createdRecords?.map((row) => [row.key, row]));
  const ids = new Map([...created].map(([key, row]) => [key, row.id]));
  for (const op of submitted) {
    const latest = current.get(op.key);
    if (!latest || latest.entity !== op.entity || latest.id !== op.id) return null;
    const allocation = created.get(op.key);
    if (!op.id && (allocation?.entity !== op.entity || !allocation.id)) return null;
    ids.set(op.key, op.id ?? allocation.id);
  }

  const result = [];
  for (const { validationState, ...op } of saved) {
    const prior = previous.get(op.key);
    const parent = op.parent?.reference.startsWith("@") ? { ...op.parent,
      reference: ids.get(op.parent.reference.slice(1)) ?? op.parent.reference } : op.parent;
    const value = resolveRefs(op.value, ids, undefined, true);
    if (!prior) {
      if (op.id) return null;
      result.push({ ...op, value, ...(parent ? { parent } : {}) });
      continue;
    }
    const id = ids.get(op.key);
    const definition = entities[op.entity];
    if (!definition) return null;
    const before = recordAt(published.models, { ...op, id });
    if (!before) return null;
    const field = definition.field || "id";
    // Fold only the changes made during publication over server-normalized data.
    const original = { ...resolveRefs(prior.value, ids, undefined, true), [field]: id };
    const merged = threeWay(original, { ...value, [field]: id }, before);
    if (merged.conflicts.length) return null;
    result.push({ ...op, id, baseCommit: published.sha, before,
      value: merged.value, ...(parent ? { parent } : {}) });
  }
  return workspaceOperations(result).map(({ validationState, ...op }) => op);
}
