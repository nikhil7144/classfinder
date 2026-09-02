import { Global, Module } from "@nestjs/common";
import { SupabaseService } from "./supabase.service";

/** Global: every feature module needs database access and none should wire it. */
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
