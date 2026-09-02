import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

/**
 * The contract, built from the same DTOs that validate at runtime.
 *
 * Kept out of main.ts so `npm run spec` can emit the document without
 * starting a server or holding a database connection — which is what lets CI
 * diff the committed spec against the code and fail when they drift. A
 * hand-maintained OpenAPI file always rots; a generated one cannot.
 */
export const buildOpenApiDocument = (app: INestApplication): OpenAPIObject => {
  const config = new DocumentBuilder()
    .setTitle("ClassFinder API")
    .setDescription(
      "The contract the web app and the Flutter app both speak.\n\n" +
        "Every request runs against Postgres as the caller, so the row-level security " +
        "policies in `db/` remain the last word on who may see what. This API adds the " +
        "contract, the validation and the tests; it does not replace those rules.",
    )
    .setVersion("1.0")
    .addBearerAuth({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "The Supabase access token, exactly as the client SDK issues it.",
    })
    .addTag("feeds", "What coaches have been posting, publicly and per parent")
    .build();

  return SwaggerModule.createDocument(app, config);
};
