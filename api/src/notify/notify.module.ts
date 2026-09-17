import { Global, Module } from "@nestjs/common";
import { DispatchController } from "./dispatch.controller";
import { PushService } from "./push.service";
import { SlackService } from "./slack.service";
import { SupabaseAdminService } from "./supabase-admin.service";

/**
 * Telling people things, outside the app.
 *
 * Global because a registration can be finished from more than one module,
 * and threading a provider through each of them to post one webhook is
 * ceremony for its own sake.
 *
 * SupabaseAdminService is deliberately **not** exported. It holds the service
 * role key, and the only thing in this codebase that has any business with it
 * is the worker in this directory — a provider every module could inject is a
 * provider somebody eventually injects.
 */
@Global()
@Module({
  controllers: [DispatchController],
  providers: [SlackService, PushService, SupabaseAdminService],
  exports: [SlackService, PushService],
})
export class NotifyModule {}
