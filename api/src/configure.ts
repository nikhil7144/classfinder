import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";

/**
 * Everything that decides what a route's URL is and what it accepts.
 *
 * Shared by the server and the spec emitter deliberately. When these were set
 * in main.ts alone, `npm run spec` produced `/feeds/me` while the running
 * service served `/api/v1/feeds/me` — and a generated client would have been
 * built against paths that do not exist. The contract has to be emitted by
 * the same configuration that serves the traffic, or it is fiction.
 */
export const configureApp = (app: INestApplication): void => {
  app.setGlobalPrefix("api");

  // The version is in the path, so v2 can land beside v1 rather than under
  // it, and an installed mobile app keeps working until it chooses to move.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  app.useGlobalPipes(
    new ValidationPipe({
      // Anything not declared on a DTO is rejected rather than forwarded, so
      // an undeclared query parameter cannot reach a database call.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
};
