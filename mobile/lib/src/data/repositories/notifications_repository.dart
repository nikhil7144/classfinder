import '../api.dart';
import '../models/notification.dart';

/// The six `/api/v1/notifications` endpoints — see mobile/README.md §11 for
/// the contract in full.
///
/// Does not write to `device_tokens` directly through Supabase: the backend
/// deliberately put registration behind a definer function rather than RLS,
/// because the upsert touches a row the caller does not own outright. This
/// repository is the only door.
class NotificationsRepository {
  const NotificationsRepository(this._api);
  final ApiClient _api;

  /// Upserts this device's token. Call on every launch — FCM rotates tokens
  /// silently, so an app that registers once and trusts it goes quiet weeks
  /// later with nothing in any log to say why — and again from
  /// `onTokenRefresh`.
  Future<void> registerDevice({
    required String token,
    required String platform,
    required String appFlavor,
    String? locale,
  }) =>
      _api.post('/api/v1/notifications/devices', body: {
        'token': token,
        'platform': platform,
        'appFlavor': appFlavor,
        if (locale != null) 'locale': locale,
      });

  /// Omit [token] to forget every device on this account rather than one.
  Future<int> forgetDevice({String? token}) async {
    final json = await _api.post('/api/v1/notifications/devices/forget',
        body: token == null ? {} : {'token': token});
    return (json as Map<String, dynamic>)['forgotten'] as int? ?? 0;
  }

  Future<List<RegisteredDevice>> devices() async {
    final json = await _api.get('/api/v1/notifications/devices');
    return (json as List<dynamic>)
        .map((e) => RegisteredDevice.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<NotificationPage> list({
    int limit = 30,
    DateTime? before,
    bool unreadOnly = false,
  }) async {
    final json = await _api.get('/api/v1/notifications', query: {
      'limit': limit,
      if (before != null) 'before': before.toIso8601String(),
      if (unreadOnly) 'unreadOnly': true,
    });
    return NotificationPage.fromJson(json as Map<String, dynamic>);
  }

  /// The badge number this leaves behind — read it off the response rather
  /// than refetching alerts, which is what it is for.
  Future<int> markRead({
    List<String>? ids,
    String? threadId,
    bool all = false,
  }) async {
    final json = await _api.post('/api/v1/notifications/read', body: {
      if (ids != null) 'ids': ids,
      if (threadId != null) 'threadId': threadId,
      if (all) 'all': true,
    });
    return (json as Map<String, dynamic>)['remaining'] as int? ?? 0;
  }

  Future<NotificationSettings> settings() async {
    final json = await _api.get('/api/v1/notifications/settings');
    return NotificationSettings.fromJson(json as Map<String, dynamic>);
  }

  /// A real PATCH — fields left out of [patch] keep their current value on
  /// the server, so callers send only the one field that changed.
  Future<NotificationSettings> updateSettings(
      Map<String, dynamic> patch) async {
    final json =
        await _api.patch('/api/v1/notifications/settings', body: patch);
    return NotificationSettings.fromJson(json as Map<String, dynamic>);
  }

  /// Public, no token needed — used to label a settings switch honestly
  /// rather than implying every kind pushes and emails alike.
  Future<List<NotificationChannel>> channels() async {
    final json = await _api.get('/api/v1/notifications/channels');
    return (json as List<dynamic>)
        .map((e) => NotificationChannel.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
