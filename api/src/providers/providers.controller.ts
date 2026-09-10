import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  ProviderProfileDto,
  ProviderSearchQueryDto,
  ProviderSearchResultDto,
} from "./dto/provider.dto";
import { SaveProviderProfileDto } from "./dto/save-profile.dto";
import { SavedProfileDto } from "./dto/saved-profile.dto";
import { ProvidersService } from "./providers.service";

/**
 * The directory: searching for a coach, and reading one.
 *
 * Both are public. A family looks before they have an account — the landing
 * page says so in as many words — and an account is only needed to get in
 * touch.
 */
@ApiTags("providers")
@Controller({ path: "providers", version: "1" })
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Public()
  @Get("search")
  @ApiOperation({
    summary: "Coaches near a place, teaching a thing",
    description:
      "Ordered by distance from the search origin: the given lat/lng if there is one, otherwise " +
      "the centroid of the area. Only approved, unsuspended coaches, and only in live areas — " +
      "the area-wise launch gate is the database's, not this endpoint's. Declared before the " +
      ":id route so /providers/search is not parsed as a coach whose id is the word search.",
  })
  @ApiOkResponse({ type: [ProviderSearchResultDto] })
  search(@Query() query: ProviderSearchQueryDto): Promise<ProviderSearchResultDto[]> {
    return this.providers.search(query);
  }

  @Put("me")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Save the caller's own listing",
    description:
      "The whole listing, not a patch: branches and service areas are replaced wholesale, so a " +
      "partial payload would clear what it left out. One transaction — it lands or it does not. " +
      "A first save leaves the listing waiting for review; an edit does not change approval, so " +
      "adjusting your fees will not take you out of search.",
  })
  @ApiOkResponse({ type: SavedProfileDto })
  saveMine(
    @CurrentUser() caller: Caller | null,
    @Body() body: SaveProviderProfileDto,
  ): Promise<SavedProfileDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.providers.saveProfile(caller, body);
  }

  @Public()
  @Get(":id")
  @ApiOperation({
    summary: "One coach's public profile",
    description:
      "Services, fees, branches, the areas they cover, certifications and availability. A coach " +
      "who is not approved, is suspended, or is an event planner is a 404 — the same answer a " +
      "stranger gets for an id that was never real.",
  })
  @ApiOkResponse({ type: ProviderProfileDto })
  one(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() caller: Caller | null,
  ): Promise<ProviderProfileDto> {
    return this.providers.one(id, caller);
  }
}
