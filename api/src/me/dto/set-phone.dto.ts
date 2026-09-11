import { ApiProperty } from "@nestjs/swagger";
import { Matches, MaxLength, MinLength } from "class-validator";

/**
 * The number a coach is reached on.
 *
 * It lives on `profiles` rather than `providers`, which is why it is not part
 * of SaveProviderProfileDto: the web form asks for it in the same panel and
 * then writes it with a separate statement. A client that does not write
 * tables had no way to set it at all, so a listing saved from the app was
 * complete by every rule except the one that lets anybody ring.
 *
 * Deliberately permissive. Numbers arrive as "9876543210", "+91 98765 43210"
 * and "098765-43210", all of which reach the same handset, and a strict
 * pattern here would refuse a real number on a formatting opinion. The floor
 * is that it contains enough digits to be one.
 */
export class SetPhoneDto {
  @ApiProperty({
    example: "+91 98765 43210",
    description: "Digits, optionally with +, spaces or hyphens. Stored as written.",
  })
  @MinLength(6, { message: "That number looks too short." })
  @MaxLength(20, { message: "That number looks too long." })
  @Matches(/^\+?[\d\s-]+$/, { message: "A phone number can only contain digits, spaces and +." })
  @Matches(/(\d[\s-]*){6,}/, { message: "That does not look like a phone number." })
  phone!: string;
}
