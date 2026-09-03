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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import {
  AnswerQueryDto,
  AnsweredQueryDto,
  QUERY_STATUSES,
  QueryDto,
  RaiseQueryDto,
  UpdateQueryStatusDto,
} from "./dto/query.dto";
import { QueriesService } from "./queries.service";

/**
 * Queries are leads, not conversations.
 *
 * A parent asks a coach to get in touch; the coach works it through a status
 * rather than a chat, and opens a conversation only if writing is the right
 * answer. That conversation carries the query id, so the parent can see why a
 * coach is messaging them.
 */
@ApiTags("queries")
@Controller({ path: "queries", version: "1" })
export class QueriesController {
  constructor(private readonly queries: QueriesService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Queries the caller is party to",
    description:
      "A coach gets the ones raised with them, a parent gets their own. One endpoint for both " +
      "sides — the row policy decides which rows those are, so neither has to say who it is.",
  })
  @ApiQuery({ name: "status", required: false, enum: QUERY_STATUSES })
  @ApiOkResponse({ type: [QueryDto] })
  list(@CurrentUser() caller: Caller | null, @Query("status") status?: string): Promise<QueryDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.queries.list(caller, status);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Ask a coach to get in touch",
    description:
      "One live query per coach — asking twice returns 400 rather than making a second lead. " +
      "Needs a completed seeker profile and an approved coach, both enforced by the row policy.",
  })
  @ApiOkResponse({ type: QueryDto })
  raise(@CurrentUser() caller: Caller | null, @Body() body: RaiseQueryDto): Promise<QueryDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.queries.raise(caller, body);
  }

  @Patch(":id/status")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Move a lead along",
    description: "The coach's own queries only. callbackAt is required for callback_scheduled.",
  })
  @ApiOkResponse({ type: QueryDto })
  setStatus(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateQueryStatusDto,
  ): Promise<QueryDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.queries.setStatus(caller, id, body);
  }

  @Post(":id/answer")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Reply in writing, opening a conversation",
    description:
      "Returns the enquiry to open. If a thread with this family already exists the message " +
      "lands there instead of starting a second one, and the query is attached to it either way.",
  })
  @ApiOkResponse({ type: AnsweredQueryDto })
  answer(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AnswerQueryDto,
  ): Promise<AnsweredQueryDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.queries.answer(caller, id, body);
  }

  @Post(":id/read")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mark it read, for whichever side is asking" })
  async markRead(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    await this.queries.markRead(caller, id);
    return { ok: true };
  }
}
