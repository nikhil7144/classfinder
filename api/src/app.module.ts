import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { FeedsModule } from "./feeds/feeds.module";
import { SuggestionsModule } from "./suggestions/suggestions.module";
import { SupabaseModule } from "./supabase/supabase.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env.local", ".env"] }),
    SupabaseModule,
    FeedsModule,
    SuggestionsModule,
  ],
  providers: [
    // Global, so a new endpoint is private until it says @Public(). Failing
    // closed is the only sane default when the alternative leaks.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
