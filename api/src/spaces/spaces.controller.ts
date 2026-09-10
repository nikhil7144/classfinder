import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  CreateSpacePostDto,
  FollowedSpaceDto,
  SetReactionDto,
  SpaceDto,
  SpacePostDto,
  SpacePostsQueryDto,
} from "./dto/space.dto";
import { SpacesService } from "./spaces.service";

/**
 * Spaces: what a coach posts, and who is reading it.
 *
 * Keyed on the provider throughout. A client arrives from search or a profile
 * holding a provider id, and making it carry a space id as well would be an
 * identifier it has no other use for.
 *
 * Image bytes never pass through here. The client uploads to Storage against a
 * signed URL and posts the resulting public URL — PLAN.md keeps that door open
 * deliberately.
 */
@ApiTags("spaces")
@Controller({ path: "spaces", version: "1" })
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get("following")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Spaces the caller follows",
    description:
      "The roster, not the reading surface — GET /feeds/me is what those coaches have been " +
      "posting. Declared before /:providerId so it is not parsed as a coach called following.",
  })
  @ApiOkResponse({ type: [FollowedSpaceDto] })
  following(@CurrentUser() caller: Caller | null): Promise<FollowedSpaceDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.spaces.following(caller);
  }

  @Put("posts/:postId/reaction")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Like, wow, surprise — or take it back",
    description:
      "One reaction per person per post. Send null to clear it; sending the same one again is " +
      "not a toggle, so a client that wants toggling decides that itself.",
  })
  setReaction(
    @CurrentUser() caller: Caller | null,
    @Param("postId", ParseUUIDPipe) postId: string,
    @Body() body: SetReactionDto,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.spaces.setReaction(caller, postId, body.reaction ?? null);
  }

  @Delete("posts/:postId")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete your own post",
    description: "Somebody else's is a 404, because saying 'forbidden' would confirm it exists.",
  })
  deletePost(
    @CurrentUser() caller: Caller | null,
    @Param("postId", ParseUUIDPipe) postId: string,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.spaces.deletePost(caller, postId);
  }

  @Public()
  @Get(":providerId")
  @ApiOperation({
    summary: "One coach's Space",
    description:
      "Readable signed out. iFollow and isMine are answers about the caller, so they are false " +
      "for a guest. A suspended Space is a 404 to everyone but its owner, and only the owner is " +
      "told why.",
  })
  @ApiOkResponse({ type: SpaceDto })
  one(
    @Param("providerId", ParseUUIDPipe) providerId: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<SpaceDto> {
    return this.spaces.one(providerId, caller);
  }

  @Public()
  @Get(":providerId/posts")
  @ApiOperation({
    summary: "What they have posted",
    description:
      "Newest first, so `before` pages backwards. Reaction counts are computed server-side " +
      "because space_reactions is readable only for your own rows — counting in a client would " +
      "report one.",
  })
  @ApiOkResponse({ type: [SpacePostDto] })
  posts(
    @Param("providerId", ParseUUIDPipe) providerId: string,
    @CurrentUser() caller: Caller | null,
    @Query() query: SpacePostsQueryDto,
  ): Promise<SpacePostDto[]> {
    return this.spaces.posts(providerId, caller, query);
  }

  @Post(":providerId/posts")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Post to your own Space",
    description:
      "The image is already in Storage; send its public URL as imageUrl. A video carries the " +
      "11-character YouTube id and nothing else.",
  })
  @ApiOkResponse({ type: SpacePostDto })
  createPost(
    @CurrentUser() caller: Caller | null,
    @Param("providerId", ParseUUIDPipe) providerId: string,
    @Body() body: CreateSpacePostDto,
  ): Promise<SpacePostDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.spaces.createPost(caller, providerId, body);
  }

  @Put(":providerId/follow")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Follow it",
    description: "Idempotent — following twice is following once. Returns the Space as it now reads.",
  })
  @ApiOkResponse({ type: SpaceDto })
  follow(
    @CurrentUser() caller: Caller | null,
    @Param("providerId", ParseUUIDPipe) providerId: string,
  ): Promise<SpaceDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.spaces.setFollowing(caller, providerId, true);
  }

  @Delete(":providerId/follow")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Stop following it" })
  @ApiOkResponse({ type: SpaceDto })
  unfollow(
    @CurrentUser() caller: Caller | null,
    @Param("providerId", ParseUUIDPipe) providerId: string,
  ): Promise<SpaceDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.spaces.setFollowing(caller, providerId, false);
  }

}
