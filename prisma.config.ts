import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Demo default: a SQLite file next to the schema. Set DATABASE_URL to point elsewhere.
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
