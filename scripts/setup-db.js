import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../src/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "..", "db", "schema.sql"), "utf8");

const res = await pool.query(schema).catch((e) => {
  console.error("Schema failed:", e.message);
  process.exit(1);
});
console.log("Schema applied.");
await pool.end();
