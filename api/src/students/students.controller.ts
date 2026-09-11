import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { APPROACH_KINDS, ApproachDto, ApproachResultDto } from "./dto/approach.dto";
import { DemandRowDto, StudentsQueryDto } from "./dto/student.dto";
import { StudentsService } from "./students.service";

/**
 * The coach's side of the marketplace: who is looking, near them.
 *
 * The unranked list. POST /suggestions/students is the overlay that lifts the
 * best fits to the top with a reason attached, and it is asked for
 * deliberately rather than rendered on arrival — this endpoint is what the
 * screen shows first.
 */
@ApiTags("students")
@Controller({ path: "students", version: "1" })
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post(":kind/:id/approach")
  @ApiBearerAuth()
  @ApiParam({ name: "kind", enum: APPROACH_KINDS })
  @ApiOperation({
    summary: "Write to a family, or to a group",
    description:
      "One message. A coach's first approach is always pending, by check constraint, and stays " +
      "that way until the family answers — while it does, no second message, no name, no phone " +
      "number. Writing to the same group twice is refused rather than duplicated.",
  })
  @ApiOkResponse({ type: ApproachResultDto })
  approach(
    @CurrentUser() caller: Caller | null,
    @Param("kind", new ParseEnumPipe({ student: "student", group: "group" }))
    kind: "student" | "group",
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ApproachDto,
  ): Promise<ApproachResultDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.students.approach(caller, kind, id, body);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Families looking for this coach",
    description:
      "Parents who have written down a requirement, and groups of neighbours who agreed on one " +
      "together, filtered to what this coach teaches and where they teach it. Untouched rows " +
      "first, then nearest, then newest. Carries no name, email or phone number: a coach answers " +
      "through Aspire91 and contact details arrive only if the family shares them.",
  })
  @ApiOkResponse({ type: [DemandRowDto] })
  mine(
    @CurrentUser() caller: Caller | null,
    @Query() query: StudentsQueryDto,
  ): Promise<DemandRowDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.students.forProvider(caller, query);
  }
}
