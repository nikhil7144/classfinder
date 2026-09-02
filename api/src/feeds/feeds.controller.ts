import { Controller, Get, Param, ParseUUIDPipe, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { CityDto } from "./dto/city.dto";
import { FeedPostDto } from "./dto/feed-post.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { FeedsService } from "./feeds.service";

@ApiTags("feeds")
@Controller({ path: "feeds", version: "1" })
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Public()
  @Get("cities")
  @ApiOperation({
    summary: "Cities open for browsing",
    description:
      "Only cities with a live area and at least one approved coach in it, busiest first. " +
      "The head of this list is the sensible default for a visitor who has not chosen.",
  })
  @ApiOkResponse({ type: [CityDto] })
  cities(): Promise<CityDto[]> {
    return this.feeds.liveCities();
  }

  @Public()
  @Get("cities/:cityId")
  @ApiOperation({
    summary: "What coaches in a city have been posting",
    description:
      "Readable signed out. Posts appear here a few hours after they are written, because " +
      "hiding a reported post needs signed-in reporters and a guest cannot report at all.",
  })
  @ApiOkResponse({ type: [FeedPostDto] })
  cityFeed(
    @Param("cityId", ParseUUIDPipe) cityId: string,
    @Query() query: FeedQueryDto,
  ): Promise<FeedPostDto[]> {
    return this.feeds.cityFeed(cityId, query);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's own feed",
    description:
      "Posts from coaches they follow, plus coaches in their city teaching what they said " +
      "they are looking for. Each post carries a `reason` saying which of the two it is.",
  })
  @ApiOkResponse({ type: [FeedPostDto] })
  myFeed(@CurrentUser() caller: Caller | null, @Query() query: FeedQueryDto): Promise<FeedPostDto[]> {
    // AuthGuard has already refused an unauthenticated caller; this satisfies
    // the type and would catch the guard being removed from this route.
    if (!caller) throw new UnauthorizedException("Sign in to read your feed.");
    return this.feeds.myFeed(caller, query);
  }
}
