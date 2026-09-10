import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { AlertsDto, MarkNotificationsReadDto } from "./dto/alerts.dto";
import { AlertsService } from "./alerts.service";

/** The badge numbers, and clearing them. */
@ApiTags("alerts")
@Controller({ path: "alerts", version: "1" })
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "What is waiting on the caller",
    description:
      "One read for every badge in the product. Answers for whoever is asking, so a client " +
      "shows the counters its role uses rather than requesting a subset. Always an object, " +
      "zeroes included — never null.",
  })
  @ApiOkResponse({ type: AlertsDto })
  mine(@CurrentUser() caller: Caller | null): Promise<AlertsDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.alerts.mine(caller);
  }

  @Post("read")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Mark notifications read",
    description:
      "Pass threadId to clear one conversation's, or omit it to clear the lot — which is what " +
      "opening the bell means.",
  })
  read(
    @CurrentUser() caller: Caller | null,
    @Body() body: MarkNotificationsReadDto,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.alerts.markRead(caller, body.threadId ?? null);
  }
}
