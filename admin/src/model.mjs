import { fail } from "./security.mjs";
export async function preview() {
  fail(400, "master_editing_not_installed");
}
