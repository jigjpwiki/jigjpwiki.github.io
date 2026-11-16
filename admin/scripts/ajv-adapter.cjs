const validators = require("../build/validators.cjs");
const schemas = require("../build/schema-map.json");
module.exports = class StaticAjv {
  addFormat() {
    return this;
  }
  addSchema() {
    return this;
  }
  compile(schema) {
    const key = schemas[JSON.stringify(schema)];
    if (!key || !validators[key])
      throw new Error("Schema was not statically compiled");
    return validators[key];
  }
  errorsText(errors) {
    return (errors || [])
      .map((e) => e.instancePath + " " + e.message)
      .join("; ");
  }
};
