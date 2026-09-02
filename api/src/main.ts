import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./configure";
import { buildOpenApiDocument } from "./swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app), {
    jsonDocumentUrl: "api/docs.json",
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API on http://localhost:${port}/api/v1 — docs at /api/docs`);
}

void bootstrap();
