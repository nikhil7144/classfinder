import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from "class-validator";

/**
 * One message. The same shape for both kinds.
 *
 * group_messages and enquiry_messages are the same five columns under two
 * names, differing only in which foreign key they carry. A client should not
 * have to know that, so the contract flattens it to `threadId` and the
 * service picks the table from `kind`.
 */
export class MessageDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid", description: "The group request or enquiry this belongs to." })
  threadId!: string;

  @ApiProperty({ format: "uuid" })
  senderId!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Return messages older than this. Pass the createdAt of the oldest you hold.",
  })
  @IsOptional()
  @IsISO8601()
  before?: string;
}

export class SendMessageDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 4000,
    description:
      "The ceiling is the database's own check constraint, repeated here so an over-long message " +
      "is a sentence about length rather than a constraint violation.",
  })
  @IsString()
  @Length(1, 4000)
  body!: string;
}
