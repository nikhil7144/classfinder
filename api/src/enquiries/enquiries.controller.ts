import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { ThreadDto } from "../threads/dto/thread.dto";
import { CreateEnquiryDto, RespondToApproachDto, SetPhoneSharingDto } from "./dto/enquiry.dto";
import { EnquiriesService } from "./enquiries.service";

/**
 * Conversations between a family and a coach, as they begin and end.
 *
 * Reading them is /threads — an enquiry is a thread of kind `enquiry`, and one
 * inbox renders both kinds. What lives here is the lifecycle the two kinds do
 * not share: opening one, answering an approach, taking one back, and the
 * phone decision.
 *
 * The web writes `enquiries` straight from EnquiryForm and calls three RPCs
 * from ThreadPane, which is why none of this existed: a client that does not
 * write tables had no way to start a conversation at all.
 */
@ApiTags("enquiries")
@Controller({ path: "enquiries", version: "1" })
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Write to a coach",
    description:
      "The family's direction. A coach approaching a family is " +
      "POST /students/{kind}/{id}/approach — two inserts into one table under two policies " +
      "with every clause inverted, so they stay two endpoints.",
  })
  create(
    @CurrentUser() caller: Caller | null,
    @Body() body: CreateEnquiryDto,
  ): Promise<{ enquiryId: string }> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.enquiries.create(caller, body);
  }

  @Post(":id/respond")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Answer a coach who approached you",
    description:
      "Accepting opens the conversation; declining closes it. Answers with the thread as it " +
      "now reads — a declined one included, carrying status `declined`, because that is what " +
      "a client needs to render the answer.",
  })
  @ApiOkResponse({ type: ThreadDto })
  respond(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RespondToApproachDto,
  ): Promise<ThreadDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.enquiries.respond(caller, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Take back an approach nobody has answered",
    description:
      "The coach's side only, and only while it is still pending. The row is deleted rather " +
      "than marked, because an approach nobody saw is not a conversation that happened.",
  })
  withdraw(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.enquiries.withdraw(caller, id);
  }

  @Put(":id/phone")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Share your number, or stop",
    description:
      "Per enquiry, never per account: sharing a number with one coach is not sharing it with " +
      "every coach who ever writes. Revocable, and the contact endpoints stop answering the " +
      "moment it is off.",
  })
  @ApiOkResponse({ type: ThreadDto })
  setPhoneSharing(
    @CurrentUser() caller: Caller | null,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetPhoneSharingDto,
  ): Promise<ThreadDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.enquiries.setPhoneSharing(caller, id, body);
  }
}
