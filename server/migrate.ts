import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  // schema.sql lives next to this file in dev (server/) and is copied beside it for prod (dist-server/)
  const candidates = [path.join(here, "schema.sql"), path.join(here, "..", "server", "schema.sql")];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error("schema.sql not found");
  await pool.query(fs.readFileSync(file, "utf8"));
}
