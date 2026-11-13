import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", override: false });
config({ override: false });

export default defineConfig({
  out: "./db/migrations",
  schema: ["./lib/db/schema.ts", "./lib/db/schema-profile.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
