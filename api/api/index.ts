import { ExpressAdapter } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import express, { type Express, type Request, type Response } from "express";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure";
import { buildOpenApiDocument } from "../src/swagger";

/**
 * The Vercel entry point.
 *
 * `npm run start:dev` and the Dockerfile both go through src/main.ts, which
 * listens on a port. Vercel does not want a listener — it wants a handler —
 * so Nest is mounted onto a bare Express app instead and Vercel calls that.
 *
 * Everything that decides what a route is and what it accepts still comes
 * from configureApp(), the same function main.ts and the tests use. If this
 * file ever configures something itself, the contract stops describing the
 * thing that serves traffic, which is the one property the whole pipeline
 * rests on.
 *
 * One caveat worth knowing rather than discovering: this runs as a serverless
 * function, so ReferenceService's in-memory cache lives only as long as an
 * instance. A warm instance still skips the query; a cold one pays for it.
 * That is a weaker guarantee than the container version gives, and it is the
 * price of deploying beside a site that is already here.
 */
const server: Express = express();
let ready: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    // Vercel captures stdout per invocation; Nest's boot banner on every cold
    // start is noise in a log people read to find real errors.
    logger: ["error", "warn"],
  });

  configureApp(app);

  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app), {
    jsonDocumentUrl: "api/docs.json",
  });

  await app.init();
}

export default async function handler(req: Request, res: Response): Promise<void> {
  // Bootstrapped once per instance, not once per request, and stored as the
  // promise rather than a flag so two concurrent cold requests wait on one
  // boot instead of racing to build two applications.
  if (!ready) ready = bootstrap();
  await ready;
  server(req, res);
}
