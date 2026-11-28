// Scoped to an editor mount. Invalidate on every workspace mutation/Undo/reload.
export function projectionCache(build) {
  const values = new Map();
  return {
    get(type) {
      if (!values.has(type)) values.set(type, build(type));
      return values.get(type);
    },
    clear() {
      values.clear();
    },
  };
}
export function referenceIndex(rows) {
  const index = new Map();
  for (const row of rows)
    for (const id of [row.id, row._reference, row.youtubeId].filter(Boolean))
      index.set(id, row);
  return index;
}

// Labels/pickers only: never use this projection as an edit baseline or master.
export function referenceModels(models, operations) {
  const project = (records, entity) => {
    const rows = [...records];
    for (const op of operations.filter((o) => o.entity === entity)) {
      const id = op.id || "@" + op.key,
        value = { ...structuredClone(op.value), id },
        index = rows.findIndex((r) => r.id === id);
      if (index < 0) rows.push(value);
      else rows[index] = value;
    }
    return rows;
  };
  const master={...models.talents,talents:project(models.talents.talents,"talent"),organizations:project(models.talents.organizations,"organization")};
  const events=project(models.anniversaries?.events||[],"anniversary");
  return {
    ...models,
    talents: {
      ...master,
      talents: globalThis.MemberOrder?.orderedPeople(master,events)||master.talents,
    },
    anniversaries: { ...models.anniversaries, events },
    catalog: {
      ...models.catalog,
      groups: project(models.catalog.groups, "group"),
    },
  };
}
