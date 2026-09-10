import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { EntriesModule } from "./entries/entries.module";
import { EventsModule } from "./events/events.module";
import { FeedsModule } from "./feeds/feeds.module";
import { HealthController } from "./health/health.controller";
import { MeModule } from "./me/me.module";
import { OrganisersModule } from "./organisers/organisers.module";
import { ProvidersModule } from "./providers/providers.module";
import { QueriesModule } from "./queries/queries.module";
import { ReferenceModule } from "./reference/reference.module";
import { StudentsModule } from "./students/students.module";
import { SuggestionsModule } from "./suggestions/suggestions.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { ThreadsModule } from "./threads/threads.module";
import { SupabaseModule } from "./supabase/supabase.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env.local", ".env"] }),
    SupabaseModule,
    SubscriptionsModule,
    EntriesModule,
    EventsModule,
    FeedsModule,
    MeModule,
    OrganisersModule,
    ProvidersModule,
    QueriesModule,
    ReferenceModule,
    StudentsModule,
    SuggestionsModule,
    ThreadsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global, so a new endpoint is private until it says @Public(). Failing
    // closed is the only sane default when the alternative leaks.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
