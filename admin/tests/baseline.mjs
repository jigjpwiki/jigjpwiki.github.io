import baseline from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import fs from "node:fs";
import { readFiles, filePath } from "../src/github.mjs";
export const baselineModels = () => structuredClone(baseline);
export const currentModels = () =>
  Object.fromEntries(
    readFiles.map((n) => [
      n,
      JSON.parse(
        fs.readFileSync(new URL("../../" + filePath(n), import.meta.url)),
      ),
    ]),
  );
