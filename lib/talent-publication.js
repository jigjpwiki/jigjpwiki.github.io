"use strict";
// Existing records without visibility remain public. Never publish a draft master row.
function publicTalents(master) {
  const talents = master.talents.filter((t) => t.visibility !== "draft");
  if (talents.length === master.talents.length) return master;
  const refs = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object")
      for (const [key, v] of Object.entries(value)) {
        if (key === "sourceRefs" || key.endsWith("SourceRefs"))
          v.forEach((id) => refs.add(id));
        else collect(v);
      }
  };
  collect(talents);
  collect(master.organizations);
  return {
    ...master,
    talents,
    sources: master.sources.filter((s) => refs.has(s.id)),
  };
}
function assertPrivateUnreferenced(master, models) {
  for (const t of master.talents.filter((t) => t.visibility === "draft"))
    for (const model of models) {
      const visit = (value) => {
        if (value === t.id)
          throw new Error(
            "Draft talent has public references; resolve impact before hiding",
          );
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object")
          Object.values(value).forEach(visit);
      };
      visit(model);
    }
}
module.exports = { publicTalents, assertPrivateUnreferenced };
