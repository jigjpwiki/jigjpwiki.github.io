import { fail } from "./security.mjs";
import { cmsPermissions } from "./cms-scope.mjs";
import { equal, recordAt, threeWay } from "./submission-plan.mjs";

export function inspectDraftConflicts(snapshot, member, operations, choices) {
  if (member.role !== "editor" || !operations?.length) fail(403, "cms_scope_denied");
  if (choices !== undefined && !Array.isArray(choices)) fail(400, "cms_conflict_choice");
  const access = cmsPermissions(snapshot.models, member);
  const conflicts = [], resolved = [];
  for (const op of operations) {
    if (!op.id) {
      resolved.push({ ...op, baseCommit: snapshot.sha });
      continue;
    }
    const current = recordAt(snapshot.models, op);
    if (!access.canRead(op.entity, current) || !access.canRead(op.entity, op.before))
      fail(403, "cms_scope_denied");
    const merged = threeWay(op.before, op.value, current);
    for (const conflict of merged.conflicts) {
      const index = conflicts.length;
      conflicts.push({ ...conflict, entity: op.entity, id: op.id, key: op.key });
      if (choices === undefined) continue;
      if (!["ours", "theirs"].includes(choices[index])) fail(400, "cms_conflict_choice");
      if (choices[index] === "ours") continue;
      if (conflict.field === "/") merged.value = structuredClone(current);
      else {
        const path = conflict.field.slice(1).split("/");
        const field = path.pop();
        let parent = merged.value;
        for (const segment of path) parent = parent[segment];
        if (conflict.theirs === undefined) delete parent[field];
        else parent[field] = structuredClone(conflict.theirs);
      }
    }
    resolved.push({ ...op, before: current, value: merged.value, baseCommit: snapshot.sha });
  }
  if (choices !== undefined && choices.length !== conflicts.length)
    fail(400, "cms_conflict_choice");
  return { conflicts, resolved, unchanged: resolved.every((op) => op.id && equal(op.before, op.value)) };
}
