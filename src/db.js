import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res;
}

export async function one(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}
