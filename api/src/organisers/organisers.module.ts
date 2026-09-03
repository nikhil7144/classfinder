import { Module } from "@nestjs/common";
import { OrganisersController } from "./organisers.controller";
import { OrganisersService } from "./organisers.service";

@Module({
  controllers: [OrganisersController],
  providers: [OrganisersService],
})
export class OrganisersModule {}
