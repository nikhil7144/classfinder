import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import {
  CoachSuggestionsDto,
  StudentSuggestionsDto,
  StudentSuggestionsQueryDto,
} from "./dto/suggestions.dto";
import { SuggestionsService } from "./suggestions.service";

/**
 * The first endpoints here that hold a secret.
 *
 * The feeds moved because it was tidy; these moved because they had to. Both
 * called a model with a key that cannot live in a browser or a phone, so they
 * were Next-only — which meant the mobile app had no suggestions at all. A
 * server is exactly what a secret needs, and this is now the only one.
 *
 * POST, not GET, because a miss costs a model call. Nothing about that is
 * cacheable by an intermediary, and a GET invites one to try.
 */
@ApiTags("suggestions")
@Controller({ path: "suggestions", version: "1" })
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Post("coaches")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Coaches worth looking at first",
    description:
      "For a signed-in parent with a stated requirement. search_providers() decides who is " +
      "eligible; the model only orders them and says why. Answers are cached against a " +
      "fingerprint of the requirement and the candidate set, so a second look is free until " +
      "one of them changes. Always returns a list where one exists — `ranked: false` means " +
      "it is in plain distance order, not that anything failed.",
  })
  @ApiOkResponse({ type: CoachSuggestionsDto })
  coaches(@CurrentUser() caller: Caller | null): Promise<CoachSuggestionsDto> {
    if (!caller) throw new UnauthorizedException("Sign in to get suggestions.");
    return this.suggestions.coachesForSeeker(caller);
  }

  @Post("students")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Families worth a coach's attention first",
    description:
      "The same idea pointed the other way, over the coach's demand feed. Not cached: unlike " +
      "the parent's, this one is asked for deliberately rather than rendered on arrival.",
  })
  @ApiOkResponse({ type: StudentSuggestionsDto })
  students(
    @CurrentUser() caller: Caller | null,
    @Body() query: StudentSuggestionsQueryDto,
  ): Promise<StudentSuggestionsDto> {
    if (!caller) throw new UnauthorizedException("Sign in to get suggestions.");
    return this.suggestions.studentsForProvider(caller, query);
  }
}
