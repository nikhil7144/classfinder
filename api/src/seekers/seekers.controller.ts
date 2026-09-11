import { Body, Controller, Get, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { MySeekerDto, SaveSeekerProfileDto } from "./dto/seeker.dto";
import { SeekersService } from "./seekers.service";

/**
 * A family's own profile.
 *
 * The seeker half of M8, and the piece a seeker app cannot start without.
 * SeekerProfileForm writes the table directly, which a client that does not
 * write tables cannot do, so onboarding had no path at all — and nothing
 * downstream of onboarding works without it.
 */
@ApiTags("seekers")
@Controller({ path: "seekers", version: "1" })
export class SeekersController {
  constructor(private readonly seekers: SeekersService) {}

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Your own profile",
    description:
      "404 for a family who has not filled one in yet. That is the expected state and not an " +
      "error: the account exists from the moment a role is chosen, and the row is written by " +
      "the first save.",
  })
  @ApiOkResponse({ type: MySeekerDto })
  mine(@CurrentUser() caller: Caller | null): Promise<MySeekerDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.seekers.mine(caller);
  }

  @Put("me")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Save it, whole",
    description:
      "The whole profile every time, not a patch: the row is upserted, so a partial payload " +
      "would clear what it omitted. One call and one transaction — the web does this as an " +
      "upsert plus a separate profile_complete update.",
  })
  @ApiOkResponse({ type: MySeekerDto })
  save(
    @CurrentUser() caller: Caller | null,
    @Body() body: SaveSeekerProfileDto,
  ): Promise<MySeekerDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.seekers.save(caller, body);
  }
}
