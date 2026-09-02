import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

/**
 * Paging, as a cursor rather than an offset.
 *
 * `before` is the createdAt of the last post you were given. Offsets go wrong
 * the moment anything is posted while a reader is paging; a timestamp cursor
 * cannot skip or repeat a row.
 */
export class FeedQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 60, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Return posts older than this. Pass the createdAt of the last post you have.",
  })
  @IsOptional()
  @IsISO8601()
  before?: string;
}
