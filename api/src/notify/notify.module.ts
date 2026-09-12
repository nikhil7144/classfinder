import { Global, Module } from "@nestjs/common";
import { SlackService } from "./slack.service";

/**
 * Telling the team things. Global because a registration can be finished from
 * more than one module, and threading a provider through each of them to post
 * one webhook is ceremony for its own sake.
 */
@Global()
@Module({
  providers: [SlackService],
  exports: [SlackService],
})
export class NotifyModule {}
