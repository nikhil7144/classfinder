import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import {
  CancelEntryDto,
  CreateEntryDto,
  EntryDto,
  SetEntryPaymentDto,
} from "./dto/entry.dto";
import { EntriesService } from "./entries.service";

/**
 * Entering an event, and what happens to that entry afterwards.
 *
 * Every write is a definer function in db/, called as the caller. Nothing
 * here decides who may do what: capacity needs a lock, the receipt number
 * must be unwritable by the person it bills, and the cancellation deadline
 * depends on which side is asking — none of which an API tier can promise
 * and all of which 3K does.
 */
@ApiTags("entries")
@Controller({ path: "entries", version: "1" })
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get("mine")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "What this family has entered",
    description: "Newest first, cancelled ones included — a withdrawal is part of the record.",
  })
  @ApiOkResponse({ type: [EntryDto] })
  mine(@CurrentUser() caller: Caller | null): Promise<EntryDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.entries.mine(caller);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Enter an event",
    description:
      "Against a category, which names its own event. Refusals arrive as sentences: the " +
      "category is full, entries have closed, the age band does not fit.",
  })
  @ApiCreatedResponse({ type: EntryDto })
  create(@CurrentUser() caller: Caller | null, @Body() body: CreateEntryDto): Promise<EntryDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.entries.create(caller, body);
  }

  @Post(":id/cancel")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Withdraw, or cancel somebody's entry",
    description:
      "A family may until the event's cancellation deadline; the organiser may until the event " +
      "is marked finished. Never a delete — the receipt survives.",
  })
  @ApiCreatedResponse({ type: EntryDto })
  cancel(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CancelEntryDto,
  ): Promise<EntryDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.entries.cancel(caller, id, body);
  }

  @Patch(":id/payment")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Record what was paid",
    description:
      "The organiser's alone. A parent who could set this could mark themselves paid — the " +
      "same reason a coach does not certify their own trial attendance.",
  })
  @ApiOkResponse({ type: EntryDto })
  setPayment(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetEntryPaymentDto,
  ): Promise<EntryDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.entries.setPayment(caller, id, body);
  }
}

/**
 * The register, which hangs off an event rather than off an entry.
 *
 * A separate controller because the path is the event's. Nest matches
 * `:id/entries` and `:id` as different routes, so this does not collide with
 * the events controller.
 */
@ApiTags("entries")
@Controller({ path: "events", version: "1" })
export class EventEntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get(":id/entries")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Who has entered one event",
    description:
      "The owner's register. Anybody else gets an empty list rather than a refusal, because a " +
      "refusal would confirm the event has entries in it.",
  })
  @ApiOkResponse({ type: [EntryDto] })
  forEvent(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<EntryDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.entries.forEvent(caller, id);
  }
}
