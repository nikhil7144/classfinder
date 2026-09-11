import { Body, Controller, Get, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { ChooseRoleDto } from "./dto/choose-role.dto";
import { MeDto } from "./dto/me.dto";
import { MeService } from "./me.service";

@ApiTags("me")
@Controller({ path: "me", version: "1" })
export class MeController {
  constructor(private readonly me: MeService) {}

  @Put("role")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Choose a side, once",
    description:
      "What /choose-role does on the web, reachable by a client that does not write tables — " +
      "without it a mobile app can create a session and then has nowhere to go. Settable only " +
      "while the account has no role; asking for the role you already have returns it. Changing " +
      "one is a different action and is not always allowed.",
  })
  @ApiOkResponse({ type: MeDto })
  chooseRole(@CurrentUser() caller: Caller | null, @Body() body: ChooseRoleDto): Promise<MeDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.me.chooseRole(caller, body.role);
  }

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
