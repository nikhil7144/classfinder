import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

/** Every role a person may choose for themselves. 'admin' is not one. */
export const CHOOSABLE_ROLES = ["seeker", "provider", "organiser"] as const;

/**
 * Picking a side, once.
 *
 * 'admin' is absent from the enum rather than rejected by a check, so it is
 * not expressible in the contract at all. The database refuses it a second
 * time — phase 3C's trigger blocks self-promotion on INSERT and UPDATE — and
 * that is the one doing the real work.
 */
export class ChooseRoleDto {
  @ApiProperty({
    enum: CHOOSABLE_ROLES,
    description:
      "Only settable while the account has no role. Changing an existing one is switch_role's " +
      "job, which refuses once a profile is complete and clears up what is left behind.",
  })
  @IsIn(CHOOSABLE_ROLES)
  role!: string;
}
