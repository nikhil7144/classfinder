import { ApiProperty } from "@nestjs/swagger";

/** A city the product is actually open in, with something to show. */
export class CityDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Indore" })
  name!: string;

  @ApiProperty({ nullable: true, type: String, example: "Madhya Pradesh" })
  state!: string | null;

  @ApiProperty({ description: "Approved coaches serving a live area of this city." })
  coachCount!: number;
}
