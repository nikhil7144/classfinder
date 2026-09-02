import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";

/**
 * What a platform polls to decide whether this instance should get traffic.
 *
 * Deliberately shallow: it reports that the process is up and serving, not
 * that Postgres is reachable. A health check that fails when the database
 * blips takes the whole service out of rotation over something restarting it
 * cannot fix — and every endpoint here already fails soft on its own.
 */
@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  private readonly startedAt = Date.now();

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness — the process is up and serving" })
  @ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        uptimeSeconds: { type: "number", example: 1234 },
      },
    },
  })
  get() {
    return { status: "ok", uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000) };
  }
}
