import { Body, Controller, Get, Patch, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Caller, CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import {
  DeviceDto,
  ForgetDeviceDto,
  ForgetDeviceResultDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  MarkReadResultDto,
  NotificationChannelDto,
  NotificationListDto,
  NotificationSettingsDto,
  RegisteredDeviceDto,
  RegisterDeviceDto,
  UpdateNotificationSettingsDto,
} from "./dto/notification.dto";
import { NotificationsService } from "./notifications.service";

/**
 * The notification list, and everything a phone needs to receive one.
 *
 * Distinct from /alerts, which counts what is *outstanding* — unanswered
 * enquiries, groups short of members, leads nobody has rung. Those are states
 * of the product, computed on read, and they go down when the work is done.
 * These are *events*, queued when they happened, and they stay in the list
 * after they are read. A bell shows the count from /alerts and this list when
 * it is opened.
 */
@ApiTags("notifications")
@Controller({ path: "notifications", version: "1" })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "What has happened, newest first",
    description:
      "Paged on time rather than an offset: notifications arrive while somebody is scrolling, " +
      "and an offset would shuffle the page under their thumb each time one did. Pass the " +
      "previous page's nextBefore to continue.",
  })
  @ApiOkResponse({ type: NotificationListDto })
  list(
    @CurrentUser() caller: Caller | null,
    @Query() params: ListNotificationsQueryDto,
  ): Promise<NotificationListDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.notifications.list(caller, params);
  }

  @Post("read")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Mark notifications read",
    description:
      "Three readings, narrowest first: `ids` for specific ones, `threadId` for a conversation, " +
      "`all` for the lot. A body naming none of them is refused rather than treated as `all` — " +
      "clearing everything by accident cannot be undone. Returns the unread count afterwards, " +
      "so a badge does not need a second call.",
  })
  @ApiOkResponse({ type: MarkReadResultDto })
  async read(
    @CurrentUser() caller: Caller | null,
    @Body() body: MarkReadDto,
  ): Promise<MarkReadResultDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return { remaining: await this.notifications.markRead(caller, body) };
  }

  @Post("devices")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Register this device for push",
    description:
      "Call on every launch, not only the first. FCM rotates tokens, and an app that registers " +
      "once goes quiet weeks later with nothing anywhere to say why. Re-registering also brings " +
      "back a device FCM had previously told us to give up on. Safe to repeat: the token is the " +
      "key, so the same device signing in as somebody else moves rather than doubling up.",
  })
  @ApiOkResponse({ type: RegisteredDeviceDto })
  async register(
    @CurrentUser() caller: Caller | null,
    @Body() body: RegisterDeviceDto,
  ): Promise<RegisteredDeviceDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return { id: await this.notifications.registerDevice(caller, body) };
  }

  @Post("devices/forget")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Stop push to this device, or to all of them",
    description:
      "Call on sign-out. The token belongs to the device rather than the session, so an app " +
      "that signs out without this leaves the next person to use that phone receiving the last " +
      "person's messages. Omit the token to cover every device on the account.",
  })
  @ApiOkResponse({ type: ForgetDeviceResultDto })
  async forget(
    @CurrentUser() caller: Caller | null,
    @Body() body: ForgetDeviceDto,
  ): Promise<ForgetDeviceResultDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return { forgotten: await this.notifications.forgetDevice(caller, body) };
  }

  @Get("devices")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Devices registered on this account",
    description: "Never includes the tokens themselves — they are send credentials, not data.",
  })
  @ApiOkResponse({ type: [DeviceDto] })
  devices(@CurrentUser() caller: Caller | null): Promise<DeviceDto[]> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.notifications.devices(caller);
  }

  @Get("settings")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "What this person wants to be told about",
    description:
      "Answers with the defaults for somebody who has never changed anything, rather than 404ing " +
      "— a client should not have to treat 'never touched it' as a separate case.",
  })
  @ApiOkResponse({ type: NotificationSettingsDto })
  settings(@CurrentUser() caller: Caller | null): Promise<NotificationSettingsDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.notifications.settings(caller);
  }

  @Patch("settings")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Change them",
    description:
      "A real PATCH: fields you leave out keep their current values. Quiet hours hold push only " +
      "— an email arriving at 2am is not a buzz at 2am — and need a start and an end or neither.",
  })
  @ApiOkResponse({ type: NotificationSettingsDto })
  updateSettings(
    @CurrentUser() caller: Caller | null,
    @Body() body: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    if (!caller) throw new UnauthorizedException("Sign in first.");
    return this.notifications.updateSettings(caller, body);
  }

  @Get("channels")
  @Public()
  @ApiOperation({
    summary: "Which kinds push and which email",
    description:
      "The product's decision, not the caller's, which is why it is a read and not a setting. A " +
      "settings screen uses it to say 'we'll email this one' rather than implying a switch that " +
      "does nothing.",
  })
  @ApiOkResponse({ type: [NotificationChannelDto] })
  channels(): Promise<NotificationChannelDto[]> {
    return this.notifications.channels();
  }
}
