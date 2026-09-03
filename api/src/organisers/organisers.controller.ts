import { Body, Controller, Get, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { OrganiserDto, UpdateOrganiserDto } from "./dto/organiser.dto";
import { OrganisersService } from "./organisers.service";

@ApiTags("organisers")
@Controller({ path: "organisers", version: "1" })
export class OrganisersController {
  constructor(private readonly organisers: OrganisersService) {}

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's own organiser listing",
    description:
      "Null before they have created one — a normal state for an account that has picked the " +
      "role and not filled the form in yet, not an error. Visible while unapproved, so a " +
      "company waiting on an admin can see what it submitted.",
  })
  @ApiOkResponse({ type: OrganiserDto, description: "Null when no listing exists yet." })
  mine(@CurrentUser() caller: Caller | null): Promise<OrganiserDto | null> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.organisers.mine(caller);
  }

  @Put("me")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create or update it",
    description:
      "One listing per account, so this upserts. Approval and suspension are absent from the " +
      "body by design and withheld by column privileges besides — naming either is refused by " +
      "Postgres, not just by this contract.",
  })
  @ApiOkResponse({ type: OrganiserDto })
  save(
    @CurrentUser() caller: Caller | null,
    @Body() body: UpdateOrganiserDto,
  ): Promise<OrganiserDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.organisers.save(caller, body);
  }
}
