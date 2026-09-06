import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  CreateEventDto,
  EventDto,
  ReplaceEventCategoriesDto,
  SetEventStatusDto,
  UpdateEventDto,
} from "./dto/event.dto";
import { EventsService } from "./events.service";

/**
 * Tournaments, competitions and showcases.
 *
 * Run by an event company or by a coach — the events table carries both, and
 * this controller never asks which the caller is: the party is read from the
 * caller's own row, and the row policies decide what they can see and change.
 */
@ApiTags("events")
@Controller({ path: "events", version: "1" })
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get("mine")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's own events",
    description:
      "Drafts included, soonest first. Declared before the :id route so that /events/mine is " +
      "not parsed as an event whose id is the word mine.",
  })
  @ApiOkResponse({ type: [EventDto] })
  mine(@CurrentUser() caller: Caller | null): Promise<EventDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.events.mine(caller);
  }

  @Public()
  @Get("city/:cityId")
  @ApiOperation({
    summary: "What is on in a city",
    description:
      "Published events whose owner is approved and unsuspended. No account needed — a parent " +
      "deciding whether to sign up should be able to look first.",
  })
  @ApiOkResponse({ type: [EventDto] })
  byCity(
    @Param("cityId", ParseUUIDPipe) cityId: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<EventDto[]> {
    return this.events.byCity(cityId, caller);
  }

  @Public()
  @Get(":id")
  @ApiOperation({
    summary: "One event, with its categories",
    description:
      "Public once published; the owner sees their own drafts too. A draft is a 404 to anybody " +
      "else, because saying 'forbidden' would confirm it exists.",
  })
  @ApiOkResponse({ type: EventDto })
  one(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<EventDto> {
    return this.events.one(id, caller);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create an event",
    description:
      "Always a draft. The owner is taken from the caller's own coach or company row, never " +
      "from the body — whose event it is is not the client's to nominate.",
  })
  // 201, which is what Nest actually returns for a POST. Documenting 200 here
  // would put a number in the contract that the server never sends.
  @ApiCreatedResponse({ type: EventDto })
  create(@CurrentUser() caller: Caller | null, @Body() body: CreateEventDto): Promise<EventDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.events.create(caller, body);
  }

  @Patch(":id")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit one",
    description: "Only fields present in the body are touched. Ownership columns are not editable.",
  })
  @ApiOkResponse({ type: EventDto })
  update(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateEventDto,
  ): Promise<EventDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.events.update(caller, id, body);
  }

  @Patch(":id/status")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Publish, withdraw, cancel or close",
    description:
      "A separate act from editing because publishing has its own condition: the row policy " +
      "only lets an approved, unsuspended owner move an event to published.",
  })
  @ApiOkResponse({ type: EventDto })
  setStatus(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetEventStatusDto,
  ): Promise<EventDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.events.setStatus(caller, id, body.status);
  }

  @Put(":id/categories")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Replace the category set",
    description:
      "Send the list the form now shows and it becomes the set. Order of the array is the order " +
      "they display in, so a client never numbers its own rows.",
  })
  @ApiOkResponse({ type: EventDto })
  replaceCategories(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReplaceEventCategoriesDto,
  ): Promise<EventDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.events.replaceCategories(caller, id, body);
  }
}
