import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { AlertsModule } from "./alerts/alerts.module";
import { EntriesModule } from "./entries/entries.module";
import { EventsModule } from "./events/events.module";
import { FeedsModule } from "./feeds/feeds.module";
import { HealthController } from "./health/health.controller";
import { MeModule } from "./me/me.module";
import { OrganisersModule } from "./organisers/organisers.module";
import { EnquiriesModule } from "./enquiries/enquiries.module";
import { GroupsModule } from "./groups/groups.module";
import { TrialsModule } from "./trials/trials.module";
import { SeekersModule } from "./seekers/seekers.module";
import { ProvidersModule } from "./providers/providers.module";
import { QueriesModule } from "./queries/queries.module";
import { ReferenceModule } from "./reference/reference.module";
import { SpacesModule } from "./spaces/spaces.module";
import { StudentsModule } from "./students/students.module";
import { SuggestionsModule } from "./suggestions/suggestions.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { ThreadsModule } from "./threads/threads.module";
import { SupabaseModule } from "./supabase/supabase.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env.local", ".env"] }),
    SupabaseModule,
    AlertsModule,
    SubscriptionsModule,
    EntriesModule,
    EventsModule,
    FeedsModule,
    MeModule,
    OrganisersModule,
    SeekersModule,
    EnquiriesModule,
    TrialsModule,
    GroupsModule,
    ProvidersModule,
    QueriesModule,
    ReferenceModule,
    SpacesModule,
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
