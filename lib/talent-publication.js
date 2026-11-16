"use strict";
// Existing records without visibility remain public. Never publish a draft master row.
function publicTalents(master) {
  const talents = master.talents.filter((t) => t.visibility !== "draft");

  return { ...master, talents };
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
