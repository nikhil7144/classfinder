import { Module } from "@nestjs/common";
import { EntriesController, EventEntriesController } from "./entries.controller";
import { EntriesService } from "./entries.service";

@Module({
  controllers: [EntriesController, EventEntriesController],
  providers: [EntriesService],
})
export class EntriesModule {}
