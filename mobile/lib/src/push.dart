import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/models/thread.dart';
import 'flavor.dart';
import 'providers.dart';
import 'router.dart';

/// Push notifications — see README §11 for the contract this talks to.
///
/// Sits beside router.dart rather than under data/, same reason as the
/// comment there: this touches navigation and platform channels, so it is
/// not pure Dart and does not belong below the seam providers.dart draws.
///
/// [Firebase.initializeApp] is wrapped in a try/catch everywhere it
/// matters, so a build made before a flavor's google-services.json exists
/// keeps working exactly as it did before this file existed — push simply
/// never comes on. [PushService.ready] is what every other method here
/// checks first, and nothing throws if it is false.
class PushService {
  PushService(this._ref);
  final Ref _ref;

  final _localNotifications = FlutterLocalNotificationsPlugin();
  bool _listenersAttached = false;

  /// Call once, in main(), before runApp() — Firebase requires this to
  /// happen before anything else here is touched.
  static Future<void> initializeFirebase() async {
    try {
      await Firebase.initializeApp();
    } catch (_) {
      // No google-services.json for this flavor yet, or no Firebase
      // project at all — see README §11. Everything else in this file
      // checks `ready` before doing anything, so this is the only place
      // that needs to know the attempt failed.
    }
  }

  /// False until a Firebase app has actually initialized. Every other
  /// method on this class is a no-op when this is false, rather than an
  /// error — a device with no config registered should behave exactly
  /// like the app did before push existed, not crash on a missing file.
  bool get ready => Firebase.apps.isNotEmpty;

  String get _platform => Platform.isIOS ? 'ios' : 'android';
  String get _appFlavor => appFlavor.isProvider ? 'provider' : 'seeker';

  /// Call once, early in the app's life (see app.dart). Sets up local
  /// notification display for the foreground case and all three tap entry
  /// points — terminated, background, and (via the local plugin) a
  /// notification this app itself displayed while foregrounded.
  Future<void> start() async {
    if (!ready || _listenersAttached) return;
    _listenersAttached = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) return;
        routeToNotification(Map<String, dynamic>.from(
            jsonDecode(payload) as Map<dynamic, dynamic>));
      },
    );

    // Foreground: FCM hands over the payload and displays nothing itself
    // on either platform — without this, a message arriving while someone
    // is looking at another tab is silently dropped.
    FirebaseMessaging.onMessage.listen(_showForeground);

    // Background: the app was running, not foregrounded, and the system
    // tray notification was tapped.
    FirebaseMessaging.onMessageOpenedApp.listen((m) => routeToNotification(m.data));

    // Terminated: the tap is what launched the process. Checked once, here,
    // rather than raced against — getInitialMessage() is answered from a
    // value FCM already cached before the engine finished starting.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) await routeToNotification(initial.data);
  }

  /// Upsert this device's token. Call on every launch once the account is
  /// known to be signed in and role-appropriate (see SeekerShell/HomeShell)
  /// — not just the first: FCM rotates tokens silently, and an app that
  /// registers once and trusts it goes quiet weeks later with nothing in
  /// any log to say why. The endpoint is an upsert keyed on the token, so
  /// calling it every launch costs nothing.
  ///
  /// Also wires `onTokenRefresh`, which fires the same registration again
  /// when FCM rotates the token mid-session — call this once per app life,
  /// not once per screen, or the listener count grows without bound.
  Future<void> registerDevice() async {
    if (!ready) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _register(token);
    } catch (_) {
      // Offline, or the account is not actually signed in yet — this is
      // retried next launch, and is not worth surfacing to whoever is
      // looking at the screen right now.
    }

    if (!_tokenRefreshAttached) {
      _tokenRefreshAttached = true;
      FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
        try {
          await _register(token);
        } catch (_) {}
      });
    }
  }

  bool _tokenRefreshAttached = false;

  Future<void> _register(String token) =>
      _ref.read(notificationsRepositoryProvider).registerDevice(
            token: token,
            platform: _platform,
            appFlavor: _appFlavor,
          );

  /// iOS: mandatory — nothing arrives without it. Android 13+: a runtime
  /// permission; below that it is granted at install and this is a no-op.
  ///
  /// Do not call this on first launch. A permission prompt on a screen
  /// somebody has not decided to trust yet is the cheapest way to get a
  /// permanent no, and iOS gives exactly one chance — ask at the first
  /// moment the value is obvious instead (a coach opening Queries or
  /// sending their first reply; a parent raising a query or sending an
  /// enquiry), with a one-line explanation of why first. The call site
  /// decides when; this just makes the call.
  Future<void> requestPermission() async {
    if (!ready) return;
    try {
      await FirebaseMessaging.instance.requestPermission();
    } catch (_) {
      // Refusing, or a plugin hiccup, either way everything else still
      // works — the notification list, the badges, and email.
    }
  }

  Future<void> _showForeground(RemoteMessage message) async {
    final notification = message.notification;
    final title = notification?.title ?? message.data['title'] as String?;
    final body = notification?.body ?? message.data['body'] as String?;
    if (title == null && body == null) return;

    const androidDetails = AndroidNotificationDetails(
      'messages',
      'Messages',
      importance: Importance.high,
      priority: Priority.high,
    );
    const details = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(),
    );
    // Same collapse key the backend's own envelope uses for Android's
    // native `tag` / APNs' `thread-id` (api/src/notify/push.service.ts) —
    // a second message about the same thread replaces the first tray
    // entry here too, rather than stacking, matching what already happens
    // natively when this same message arrives in the background. A plain
    // `message.hashCode` would neither collapse consistently nor rule out
    // two different messages landing on the same id.
    final collapseKey = (message.data['threadId']?.toString().isNotEmpty ==
            true)
        ? message.data['threadId']
        : (message.data['kind'] ?? message.messageId ?? title);
    await _localNotifications.show(
      collapseKey.hashCode,
      title,
      body,
      details,
      payload: jsonEncode(message.data),
    );
  }

  /// Route on threadKind + threadId first, falling back to landing on the
  /// app's root. `url` is a *web* path (`/dashboard/queries?query=<uuid>`)
  /// — it exists because one trigger serves both clients, not because this
  /// app should open it in a browser — and there is no fetch-by-id route
  /// for anything but a thread today (see router.dart's own comment on
  /// `/thread` and `/demand`), so a query notification's tap lands on the
  /// root rather than erroring. A finer destination for those needs either
  /// a real detail route or a way to pick this shell's tab from outside
  /// it, neither of which exists yet.
  ///
  /// Public, not just for the three tap entry points above: the
  /// notification list screen calls this too for an in-app tap, so a
  /// notification routes the same way whether it arrived as a push or is
  /// being read from the list days later.
  Future<void> routeToNotification(Map<String, dynamic> data) async {
    final threadKind = data['threadKind'] as String?;
    final threadId = data['threadId'] as String?;
    final router = _ref.read(routerProvider);

    if (threadKind != null &&
        threadKind.isNotEmpty &&
        threadId != null &&
        threadId.isNotEmpty) {
      try {
        final threads = await _ref.read(threadsRepositoryProvider).inbox();
        Thread? match;
        for (final t in threads) {
          if (t.threadId == threadId && t.kind == threadKind) {
            match = t;
            break;
          }
        }
        if (match != null) {
          router.push('/thread', extra: match);
          return;
        }
      } catch (_) {
        // Offline, or not signed in — fall through to landing on root.
      }
    }

    // Not a thread notification, or the row was not found — deleted, or a
    // thread the account can no longer see. A notification that outlived
    // its subject is normal; landing on the root beats showing an error.
    router.go('/');
  }
}

final pushServiceProvider = Provider<PushService>((ref) => PushService(ref));
