import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import {
  ProposeTrialDto,
  RespondToTrialDto,
  SetTrialOutcomeDto,
  TrialDto,
  TrialsQueryDto,
} from "./dto/trial.dto";
import { TrialsService } from "./trials.service";

/**
 * First classes, arranged inside a conversation.
 *
 * The product's argument is that a family and a coach should end up in a room
 * together; this is the row that says when. It is keyed on the thread
 * throughout, because thread_trials() is the only reader and it restricts
 * itself to participants — which is the whole access rule, and worth keeping
 * as the only one.
 */
@ApiTags("trials")
@Controller({ path: "trials", version: "1" })
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Trials arranged in one conversation",
    description:
      "`iProposed` and `myOutcome` are answers about the caller, so the same trial reads " +
      "differently to the two people in it. A thread the caller is not in answers empty.",
  })
  @ApiOkResponse({ type: [TrialDto] })
  forThread(
    @CurrentUser() caller: Caller | null,
    @Query() query: TrialsQueryDto,
  ): Promise<TrialDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.trials.forThread(caller, query);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Suggest a time",
    description:
      "Either side may. The function decides whether they are in the thread and whether it is " +
      "still live.",
  })
  @ApiOkResponse({ type: TrialDto })
  propose(
    @CurrentUser() caller: Caller | null,
    @Body() body: ProposeTrialDto,
  ): Promise<TrialDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.trials.propose(caller, body);
  }

  @Patch(":id")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Say yes or no to a time",
    description: "The other side answers; the one who proposed it cannot confirm their own.",
  })
  @ApiOkResponse({ type: TrialDto })
  respond(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RespondToTrialDto,
  ): Promise<TrialDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.trials.respond(caller, id, body.kind, body.threadId, body);
  }

  @Patch(":id/outcome")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Record what happened",
    description:
      "Per side. Both parties answer separately and neither answer overwrites the other — a " +
      "coach marking a no-show does not put that on the family's record.",
  })
  @ApiOkResponse({ type: TrialDto })
  setOutcome(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetTrialOutcomeDto,
  ): Promise<TrialDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.trials.setOutcome(caller, id, body.kind, body.threadId, body);
  }
}
