import { Controller, Get, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { MeDto } from "./dto/me.dto";
import { MeService } from "./me.service";

@ApiTags("me")
@Controller({ path: "me", version: "1" })
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Who is asking, and what they have finished",
    description:
      "The first call after signing in. `role: null` means a verified account that has not " +
      "chosen a role yet — send them to pick one; it is not an error. The seeker or provider " +
      "block is present only for that role.",
  })
  @ApiOkResponse({ type: MeDto })
  get(@CurrentUser() caller: Caller | null): Promise<MeDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.me.get(caller);
  }
}
