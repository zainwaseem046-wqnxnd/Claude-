import { migrate } from "./migrate.js";
import { pool } from "./db.js";

migrate()
  .then(() => { console.log("Database schema is up to date."); return pool.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
