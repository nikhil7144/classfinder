import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  CreatePlanDto,
  MyPlanDto,
  PlanBodyDto,
  PlanDto,
  RecordSubscriptionDto,
  SubscriptionDto,
} from "./dto/subscription.dto";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * What things cost, who is on what, and who has paid.
 *
 * The API owns all of it — the catalogue, the tiers, the arithmetic behind
 * "2 of 5 used". The database keeps one boolean, `may_publish_event`, which
 * the publish policy calls so that a write which never came through here
 * cannot skip a quota.
 */
@ApiTags("subscriptions")
@Controller({ path: "subscriptions", version: "1" })
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get("plans")
  @ApiOperation({
    summary: "The price list",
    description:
      "Three catalogues keyed by audience — an events company, a coach, an advertiser — and no " +
      "plan belongs to two of them.",
  })
  @ApiQuery({ name: "audience", required: false, enum: ["organiser", "provider", "advertiser"] })
  @ApiOkResponse({ type: [PlanDto] })
  plans(
    @CurrentUser() caller: Caller | null,
    @Query("audience") audience?: string,
  ): Promise<PlanDto[]> {
    return this.subscriptions.plans(audience, caller);
  }

  @Get("mine")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "What my business is on",
    description:
      "The plan comes from the same function the publish check consults, so this screen and " +
      "that refusal cannot disagree about which plan somebody is on.",
  })
  @ApiOkResponse({ type: MyPlanDto })
  mine(@CurrentUser() caller: Caller | null): Promise<MyPlanDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.subscriptions.mine(caller);
  }

  @Get("mine/purchases")
  @ApiBearerAuth()
  @ApiOperation({ summary: "What my business has paid for" })
  @ApiOkResponse({ type: [SubscriptionDto] })
  minePurchases(@CurrentUser() caller: Caller | null): Promise<SubscriptionDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.subscriptions.minePurchases(caller);
  }

  @Post("plans")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Add a plan",
    description: "Admins only. A tier is a name, a price, a period and how many events may be live.",
  })
  @ApiCreatedResponse({ type: PlanDto })
  createPlan(@CurrentUser() caller: Caller | null, @Body() body: CreatePlanDto): Promise<PlanDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.subscriptions.createPlan(caller, body);
  }

  @Patch("plans/:id")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit one",
    description:
      "Admins only. Setting maxActiveEvents to 0 on the coach default is what ends the free " +
      "period for coach events — one edit, no migration.",
  })
  @ApiOkResponse({ type: PlanDto })
  updatePlan(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PlanBodyDto,
  ): Promise<PlanDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.subscriptions.updatePlan(caller, id, body);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Every recorded purchase", description: "Admins only. Newest first." })
  @ApiOkResponse({ type: [SubscriptionDto] })
  list(@CurrentUser() caller: Caller | null): Promise<SubscriptionDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.subscriptions.listSubscriptions(caller);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Record that somebody paid",
    description:
      "Admins only, because only an admin saw the money arrive. Naming an event makes it a " +
      "per-event purchase, which is a coach paying for one tournament.",
  })
  @ApiCreatedResponse({ type: SubscriptionDto })
  record(
    @CurrentUser() caller: Caller | null,
    @Body() body: RecordSubscriptionDto,
  ): Promise<SubscriptionDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.subscriptions.record(caller, body);
  }
}
