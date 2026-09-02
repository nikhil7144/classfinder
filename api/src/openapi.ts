import { writeFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./configure";
import { buildOpenApiDocument } from "./swagger";

/**
 * Emit openapi.json without serving anything.
 *
 * This is what the Dart and TypeScript clients are generated from, and what
 * CI diffs to catch a controller changing shape without the contract being
 * regenerated alongside it.
 */
async function emit() {
  // Nothing is listening and nothing is queried, but ConfigService still
  // demands the Supabase settings at construction, so give it placeholders.
  process.env.SUPABASE_URL ||= "https://spec.invalid";
  process.env.SUPABASE_ANON_KEY ||= "spec";

  const app = await NestFactory.create(AppModule, { logger: false });
  // The same prefix and versioning the server applies, so the emitted paths
  // are the paths that actually exist.
  configureApp(app);
  const document = buildOpenApiDocument(app);
  writeFileSync("openapi.json", JSON.stringify(document, null, 2));
  await app.close();
  console.log(`openapi.json written — ${Object.keys(document.paths).length} paths`);
}

void emit();
