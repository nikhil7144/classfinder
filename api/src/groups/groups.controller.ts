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
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  CreateGroupDto,
  CreateGroupPostDto,
  DiscoverGroupDto,
  GroupContactDto,
  GroupDto,
  GroupInviteDto,
  GroupPitchDto,
  GroupPostDto,
  ProviderGroupDto,
  PublicGroupDto,
  PublishGroupDto,
  RespondToPitchDto,
  UpdateGroupDto,
  UpdatePostVisibilityDto,
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

  /* -------------------------------------------------------------------
     Communities.

     Live and public are different things. Live means the families are here
     and it is looking for a coach, which is what lets a coach see it at all.
     Public means the creator chose to showcase it on Aspire91, and only the
     creator pressing publish ever makes that true.
     ------------------------------------------------------------------- */

  @Public()
  @Get("discover")
  @ApiOperation({
    summary: "Published groups, by city, area and service",
    description:
      "Readable signed out: the point of publishing is that a stranger can find it. Carries " +
      "no society name and no member names, the same list the coach view withholds.",
  })
  @ApiQuery({ name: "cityId", required: false })
  @ApiQuery({ name: "areaId", required: false })
  @ApiQuery({ name: "serviceCategoryId", required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiOkResponse({ type: [DiscoverGroupDto] })
  discover(
    @CurrentUser() caller: Caller | null,
    @Query("cityId") cityId?: string,
    @Query("areaId") areaId?: string,
    @Query("serviceCategoryId") serviceCategoryId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<DiscoverGroupDto[]> {
    return this.groups.discover(caller, {
      cityId,
      areaId,
      serviceCategoryId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Public()
  @Get(":id/public")
  @ApiOperation({
    summary: "One published group, as a stranger sees it",
    description:
      "A group that is not published reads as missing rather than forbidden: whether it " +
      "exists at all is not a visitor's business.",
  })
  @ApiOkResponse({ type: PublicGroupDto })
  publicView(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<PublicGroupDto> {
    return this.groups.publicView(id, caller);
  }

  @Public()
  @Get("by-coach/:providerId")
  @ApiOperation({
    summary: "The groups a coach trains",
    description:
      "Published groups where that coach was accepted, for their public page. An unapproved " +
      "or suspended coach returns none, the same rule every other public read of a coach uses.",
  })
  @ApiOkResponse({ type: [ProviderGroupDto] })
  byCoach(
    @Param("providerId", ParseUUIDPipe) providerId: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<ProviderGroupDto[]> {
    return this.groups.forPublicProvider(providerId, caller);
  }

  @Patch(":id/publish")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Show it on Aspire91, or take it down",
    description:
      "Creator only, and only once the group is live. Publishing pushes expiry out to ninety " +
      "days: the ten-day clock gates demand a coach is shown, and a page meant to be found " +
      "cannot live on it.",
  })
  @ApiOkResponse({ type: PublicGroupDto })
  publish(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PublishGroupDto,
  ): Promise<PublicGroupDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.publish(caller, id, body);
  }

  @Public()
  @Get(":id/posts")
  @ApiOperation({
    summary: "What the group has posted",
    description:
      "A member sees everything. Anybody else sees only the posts their authors opened, and " +
      "only while the group is published.",
  })
  @ApiOkResponse({ type: [GroupPostDto] })
  posts(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<GroupPostDto[]> {
    return this.groups.posts(id, caller);
  }

  @Post(":id/posts")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Post to your group",
    description:
      "Members only. It starts at `members`: a parent putting a photo of their child into " +
      "their group should have it stay there unless they decide otherwise.",
  })
  @ApiOkResponse({ type: GroupPostDto })
  addPost(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreateGroupPostDto,
  ): Promise<GroupPostDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.addPost(caller, id, body);
  }

  @Patch("posts/:postId/visibility")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Open a post to the showcase, or close it",
    description:
      "The post's own author, and nobody else — not even the creator. A creator who could " +
      "promote any post could publish a photo of another family's child, and that parent " +
      "agreed to share with their group rather than with the world.",
  })
  @ApiOkResponse({ type: GroupPostDto })
  setPostVisibility(
    @CurrentUser() caller: Caller | null,
    @Param("postId", ParseUUIDPipe) postId: string,
    @Body() body: UpdatePostVisibilityDto,
  ): Promise<GroupPostDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.groups.setPostVisibility(caller, postId, body);
  }
}
