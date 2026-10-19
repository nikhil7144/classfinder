/// One row from `GET /api/v1/notifications`.
///
/// Called `AppNotification`, not `Notification` — the latter collides with
/// `dart:ui`'s `Notification` and the resulting error points nowhere near
/// the actual mistake.
///
/// `kind` is one of twelve (see `api/src/notifications/dto/
/// notification.dto.ts`'s `NOTIFICATION_KINDS`), but never switched on to
/// decide whether to render — a kind this build does not recognise yet
/// still has a `title` and `body` already written for a lock screen, and
/// treating it as unknown would mean a server-side addition silently drops
/// notifications on an app that has not shipped since.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.url,
    required this.threadKind,
    required this.threadId,
    required this.createdAt,
    required this.readAt,
    required this.unread,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final String? url;
  final String? threadKind;
  final String? threadId;
  final DateTime createdAt;
  final DateTime? readAt;
  final bool unread;

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String,
        kind: json['kind'] as String,
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        url: json['url'] as String?,
        threadKind: json['threadKind'] as String?,
        threadId: json['threadId'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        readAt: json['readAt'] == null
            ? null
            : DateTime.parse(json['readAt'] as String),
        unread: json['unread'] as bool? ?? false,
      );
}

/// One page of `GET /api/v1/notifications`.
///
/// `nextBefore` is the cursor for the next page, null once there is no
/// more — pass it back as `before` on the following call. `unread` is the
/// badge number the endpoint hands back for free, so a caller does not
/// need to count it out of `items` itself.
class NotificationPage {
  const NotificationPage({
    required this.items,
    required this.unread,
    required this.nextBefore,
  });

  final List<AppNotification> items;
  final int unread;
  final DateTime? nextBefore;

  factory NotificationPage.fromJson(Map<String, dynamic> json) =>
      NotificationPage(
        items: (json['items'] as List<dynamic>? ?? [])
            .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
            .toList(),
        unread: json['unread'] as int? ?? 0,
        nextBefore: json['nextBefore'] == null
            ? null
            : DateTime.parse(json['nextBefore'] as String),
      );
}

/// `GET`/`PATCH /api/v1/notifications/settings`.
///
/// Mutable call sites send a partial map rather than one of these —
/// `PATCH` leaves out fields that should keep their current value, and a
/// settings screen only ever changes one switch at a time.
class NotificationSettings {
  const NotificationSettings({
    required this.pushEnabled,
    required this.emailEnabled,
    required this.mutedKinds,
    required this.quietHoursStart,
    required this.quietHoursEnd,
    required this.timezone,
  });

  final bool pushEnabled;
  final bool emailEnabled;
  final List<String> mutedKinds;

  /// "HH:mm", or null when no quiet hours are set.
  final String? quietHoursStart;
  final String? quietHoursEnd;
  final String? timezone;

  factory NotificationSettings.fromJson(Map<String, dynamic> json) =>
      NotificationSettings(
        pushEnabled: json['pushEnabled'] as bool? ?? true,
        emailEnabled: json['emailEnabled'] as bool? ?? true,
        mutedKinds: (json['mutedKinds'] as List<dynamic>? ?? [])
            .map((e) => e as String)
            .toList(),
        quietHoursStart: json['quietHoursStart'] as String?,
        quietHoursEnd: json['quietHoursEnd'] as String?,
        timezone: json['timezone'] as String?,
      );
}

/// One row from the public `GET /api/v1/notifications/channels` — what a
/// kind actually does, so a settings screen can label its switches
/// honestly rather than implying every kind pushes and emails alike.
class NotificationChannel {
  const NotificationChannel({
    required this.kind,
    required this.pushes,
    required this.emails,
    required this.audience,
    required this.note,
  });

  final String kind;
  final bool pushes;
  final bool emails;
  final String audience;
  final String? note;

  factory NotificationChannel.fromJson(Map<String, dynamic> json) =>
      NotificationChannel(
        kind: json['kind'] as String,
        pushes: json['pushes'] as bool? ?? false,
        emails: json['emails'] as bool? ?? false,
        audience: json['audience'] as String? ?? '',
        note: json['note'] as String?,
      );
}

/// One row from `GET /api/v1/notifications/devices` — never the token
/// itself, which the endpoint deliberately never returns.
class RegisteredDevice {
  const RegisteredDevice({
    required this.id,
    required this.platform,
    required this.appFlavor,
    required this.lastSeenAt,
    required this.disabledReason,
  });

  final String id;
  final String platform;
  final String appFlavor;
  final DateTime lastSeenAt;
  final String? disabledReason;

  factory RegisteredDevice.fromJson(Map<String, dynamic> json) =>
      RegisteredDevice(
        id: json['id'] as String,
        platform: json['platform'] as String,
        appFlavor: json['appFlavor'] as String,
        lastSeenAt: DateTime.parse(json['lastSeenAt'] as String),
        disabledReason: json['disabledReason'] as String?,
      );
}
