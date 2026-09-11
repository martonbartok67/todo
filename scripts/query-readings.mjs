import {db} from "../lib/db.js";
import {readingItems} from "../drizzle/schema.js";
import {eq} from "drizzle-orm";

async function queryReadings() {
  const rows = await db.select().from(readingItems).limit(20);
  console.log("Total readings:", rows.length);
  console.log(JSON.stringify(rows, null, 2));
}

queryReadings().catch(console.error);