import "dotenv/config";
import {
  getDatabasePath,
  getSchemaSummary,
  initializeDatabase,
  openDatabase,
} from "./database.js";

const database = initializeDatabase(openDatabase());
const tables = getSchemaSummary(database);

console.log(`Database initialized: ${getDatabasePath()}`);
console.log(`Tables: ${tables.join(", ")}`);

database.close();
