import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../api_exception.dart';
import '../models/entry.dart';
import '../models/event.dart';
import '../supabase.dart';

/// Events a coach runs, and who has entered them.
///
/// Three endpoints rather than one save, because the three do different jobs
/// and carry different rules:
///
///   * the event body is an ordinary patch;
///   * categories are replaced as a set, keyed on id so a category keeps its
///     entries across a save;
///   * status is its own call, because publishing has a condition editing does
///     not — the update policy takes `published` only from an owner who is
///     approved and unsuspended.
///
/// Folding status into the patch would hide that behind a field that looks
/// like any other.
class EventsRepository {
  const EventsRepository(this._api);

  final ApiClient _api;

  Future<List<Event>> mine() async {
    final json = await _api.get('/api/v1/events/mine');
    return (json as List)
        .map((e) => Event.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Event> one(String id) async {
    final json = await _api.get('/api/v1/events/$id');
    return Event.fromJson(json as Map<String, dynamic>);
  }

  Future<Event> create(Event event) async {
    final json = await _api.post('/api/v1/events', body: event.toSaveJson());
    return Event.fromJson(json as Map<String, dynamic>);
  }

  Future<Event> update(String id, Event event) async {
    final json =
        await _api.patch('/api/v1/events/$id', body: event.toSaveJson());
    return Event.fromJson(json as Map<String, dynamic>);
  }

  /// Publish, withdraw, cancel or close.
  Future<Event> setStatus(String id, EventStatus status) async {
    final json = await _api.patch(
      '/api/v1/events/$id/status',
      body: {'status': status.id},
    );
    return Event.fromJson(json as Map<String, dynamic>);
  }

  /// The whole set, every time. A category absent from this list is deleted,
  /// which is why the form sends what it has rather than what changed.
  Future<Event> replaceCategories(
    String id,
    List<EventCategory> categories,
  ) async {
    final json = await _api.put(
      '/api/v1/events/$id/categories',
      body: {
        'categories': [
          for (var i = 0; i < categories.length; i++)
            (categories[i]..sortOrder = i).toJson(),
        ],
      },
    );
    return Event.fromJson(json as Map<String, dynamic>);
  }

  /// The register for one event.
  Future<List<Entry>> entries(String eventId) async {
    final json = await _api.get('/api/v1/events/$eventId/entries');
    return (json as List)
        .map((e) => Entry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Record what was paid. `waived` is the one that takes no mode — nothing
  /// changed hands.
  Future<Entry> setPayment(
    String entryId, {
    required String status,
    String? mode,
    String? reference,
  }) async {
    final json = await _api.patch(
      '/api/v1/entries/$entryId/payment',
      body: {
        'status': status,
        if (mode != null) 'mode': mode,
        if (reference != null && reference.trim().isNotEmpty)
          'reference': reference.trim(),
      },
    );
    return Entry.fromJson(json as Map<String, dynamic>);
  }

  /// Withdraw, or remove somebody. `refund` marks what is owed back rather
  /// than moving any money — nothing in this product touches a payment rail.
  Future<Entry> cancelEntry(
    String entryId, {
    String? reason,
    bool refund = false,
  }) async {
    final json = await _api.post(
      '/api/v1/entries/$entryId/cancel',
      body: {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
        'refund': refund,
      },
    );
    return Entry.fromJson(json as Map<String, dynamic>);
  }

  /// The banner, straight to Storage — the same door the listing photo and
  /// Space media use, and for the same reason.
  Future<String> uploadBanner(File file, {required String ownerId}) async {
    final ext = file.path.split('.').last.toLowerCase();
    final name = DateTime.now().microsecondsSinceEpoch.toString();
    final path = '$ownerId/$name.${ext.isEmpty ? 'jpg' : ext}';

    try {
      await supabase.storage.from('event-banners').upload(path, file);
    } on StorageException catch (e) {
      throw ApiException('That banner could not be uploaded. ${e.message}');
    }

    return supabase.storage.from('event-banners').getPublicUrl(path);
  }
}
