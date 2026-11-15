const images = require("../build/images.json");
exports.existsSync = (p) => images.includes(p);
exports.readFileSync = () => {
  throw new Error("Worker cannot read filesystem");
};
