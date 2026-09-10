import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { MessageDto, MessagesQueryDto, SendMessageDto } from "./dto/message.dto";
import { ThreadDto, THREAD_KINDS } from "./dto/thread.dto";
import { ThreadKind, ThreadsService } from "./threads.service";

/** ParseEnumPipe wants an object; THREAD_KINDS is a tuple. */
const KIND_ENUM = { group: "group", enquiry: "enquiry" };

/**
 * Conversations, from either side.
 *
 * The kind is in the path because it decides which table and which function
 * the request lands on, and a client should say which conversation it means
 * rather than discover the answer from a 404.
 *
 * Messages are read and written here; they *arrive* over Supabase Realtime,
 * which PLAN.md keeps as a direct door because a websocket with RLS applied
 * per connection gains nothing from being proxied.
 */
@ApiTags("threads")
@Controller({ path: "threads", version: "1" })
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Every conversation the caller is in",
    description:
      "Group pitches and direct enquiries in one list. Title, subtitle, unread and iAmSeeker are " +
      "already resolved for the reader, so the same thread reads differently to the two people " +
      "in it. threadId is unique within its kind and not across both — pair them for a key.",
  })
  @ApiOkResponse({ type: [ThreadDto] })
  mine(@CurrentUser() caller: Caller | null): Promise<ThreadDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.threads.mine(caller);
  }

  @Get(":kind/:id/messages")
  @ApiBearerAuth()
  @ApiParam({ name: "kind", enum: THREAD_KINDS })
  @ApiOperation({
    summary: "The conversation",
    description:
      "Newest first, so `before` pages backwards. A thread the caller is not party to is an " +
      "empty list, not a 403 — the row policies decide, and saying 'forbidden' would confirm it " +
      "exists.",
  })
  @ApiOkResponse({ type: [MessageDto] })
  messages(
    @CurrentUser() caller: Caller | null,
    @Param("kind", new ParseEnumPipe(KIND_ENUM)) kind: ThreadKind,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: MessagesQueryDto,
  ): Promise<MessageDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.threads.messages(caller, kind, id, query);
  }

  @Post(":kind/:id/messages")
  @ApiBearerAuth()
  @ApiParam({ name: "kind", enum: THREAD_KINDS })
  @ApiOperation({
    summary: "Say something",
    description:
      "The sender is the caller. Bodies are 1 to 4000 characters, which is the database's own " +
      "constraint stated where a reader can be told about it.",
  })
  @ApiOkResponse({ type: MessageDto })
  send(
    @CurrentUser() caller: Caller | null,
    @Param("kind", new ParseEnumPipe(KIND_ENUM)) kind: ThreadKind,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
  ): Promise<MessageDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.threads.send(caller, kind, id, body.body);
  }

  @Post(":kind/:id/read")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiParam({ name: "kind", enum: THREAD_KINDS })
  @ApiOperation({
    summary: "Mark it read, for whichever side is asking",
    description:
      "Writes the caller's own read timestamp. Which column that is depends on who they are, " +
      "which is why it stays a definer function rather than an update the client composes.",
  })
  read(
    @CurrentUser() caller: Caller | null,
    @Param("kind", new ParseEnumPipe(KIND_ENUM)) kind: ThreadKind,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.threads.markRead(caller, kind, id);
  }
}
