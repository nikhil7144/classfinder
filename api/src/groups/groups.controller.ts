import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  CreateGroupDto,
  GroupContactDto,
  GroupDto,
  GroupInviteDto,
  GroupPitchDto,
  RespondToPitchDto,
  UpdateGroupDto,
} from "./dto/group.dto";
import { GroupsService } from "./groups.service";

/**
 * Groups — neighbours asking for the same thing together.
 *
 * M6, and the last of the migrations. The web reads these through four RPCs
 * and writes `groups`, `group_members` and `group_requests` straight from the
 * browser, so none of it was reachable by a client that does not write tables.
 *
 * Pitching *to* a group is not here: that is the coach's direction and it goes
 * through POST /students/{kind}/{id}/approach, which already serves both a
 * group and a lone family from one demand feed. What lives here is the
 * family's side — making one, joining one, and answering the coaches who come.
 */
@ApiTags("groups")
@Controller({ path: "groups", version: "1" })
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Groups you are in",
    description:
      "Made or joined, both. `pendingRequests` is zero to anybody but the creator — how many " +
      "coaches have pitched is the creator's business.",
  })
  @ApiOkResponse({ type: [GroupDto] })
  mine(@CurrentUser() caller: Caller | null): Promise<GroupDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.mine(caller);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Start one",
    description: "The creator becomes its first member in the same call — a group of nobody is not a group.",
  })
  @ApiOkResponse({ type: GroupDto })
  create(
    @CurrentUser() caller: Caller | null,
    @Body() body: CreateGroupDto,
  ): Promise<GroupDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.create(caller, body);
  }

  @Public()
  @Get(":id/invite")
  @ApiOperation({
    summary: "A group, as an invite link shows it",
    description:
      "Readable signed out, because the whole point is that a neighbour can be sent a link and " +
      "decide. It carries nothing about who is in it, and `alreadyMember` is false for a guest.",
  })
  @ApiOkResponse({ type: GroupInviteDto })
  invite(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<GroupInviteDto> {
    return this.groups.invite(id, caller);
  }

  @Patch(":id")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit it, or close it",
    description:
      "`closed` is a field rather than its own endpoint: it is a creator saying they are done, " +
      "and it is reversible while the group has not expired.",
  })
  @ApiOkResponse({ type: GroupDto })
  update(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateGroupDto,
  ): Promise<GroupDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.update(caller, id, body);
  }

  @Post(":id/members")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Join it",
    description: "Idempotent — joining twice is joining once.",
  })
  @ApiOkResponse({ type: GroupDto })
  join(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<GroupDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.join(caller, id);
  }

  @Delete(":id/members/me")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Leave it",
    description:
      "The creator cannot: the pitches, the threads and the invite all hang off them, so they " +
      "close the group instead.",
  })
  leave(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.leave(caller, id);
  }

  @Get(":id/pitches")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Coaches who have pitched to it",
    description: "Each one is also a conversation — the messages are GET /threads/group/{id}/messages.",
  })
  @ApiOkResponse({ type: [GroupPitchDto] })
  pitches(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<GroupPitchDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.pitches(caller, id);
  }

  @Post("pitches/:requestId/respond")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Accept or decline a coach",
    description: "The creator's decision, and the update policy is what says so.",
  })
  respondToPitch(
    @CurrentUser() caller: Caller | null,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() body: RespondToPitchDto,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.respondToPitch(caller, requestId, body);
  }

  @Get("pitches/:requestId/contact")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "How to reach the group",
    description:
      "`phone` is null unless the group shared one, and `shared` says which kind of null it " +
      "is — withheld, or simply not on file.",
  })
  @ApiOkResponse({ type: GroupContactDto })
  pitchContact(
    @CurrentUser() caller: Caller | null,
    @Param("requestId", ParseUUIDPipe) requestId: string,
  ): Promise<GroupContactDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.pitchContact(caller, requestId);
  }
}
