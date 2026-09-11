import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../models/thread.dart';
import '../supabase.dart';

/// Conversations, from either side.
///
/// Reads and writes go through the API. Delivery does not: a new message
/// arrives over Realtime, which PLAN.md keeps as a direct door because a
/// websocket with RLS applied per connection gains nothing from being proxied.
/// This class is the one place both live, so a screen never has to know which
/// is which.
class ThreadsRepository {
  const ThreadsRepository(this._api);

  final ApiClient _api;

  /// Every conversation the caller is in, both kinds.
  Future<List<Thread>> inbox() async {
    final json = await _api.get('/api/v1/threads');
    return (json as List)
        .map((e) => Thread.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// The conversation. Newest first from the service, reversed here so the
  /// screen can render it oldest-at-top like every chat anybody has used.
  Future<List<Message>> messages(String kind, String threadId,
      {String? before}) async {
    final json = await _api.get(
      '/api/v1/threads/$kind/$threadId/messages',
      query: {'before': before},
    );
    final list =
        (json as List).map((e) => Message.fromJson(e as Map<String, dynamic>));
    return list.toList().reversed.toList();
  }

  Future<Message> send(String kind, String threadId, String body) async {
    final json = await _api.post(
      '/api/v1/threads/$kind/$threadId/messages',
      body: {'body': body},
    );
    return Message.fromJson(json as Map<String, dynamic>);
  }

  Future<void> markRead(String kind, String threadId) =>
      _api.post('/api/v1/threads/$kind/$threadId/read');

  /// New messages as they land.
  ///
  /// The one place the app subscribes to Postgres directly. RLS is applied per
  /// connection, so a thread the caller is not party to yields nothing — the
  /// filter below narrows what is delivered, it is not what makes it safe.
  ///
  /// The table and its foreign key differ by kind, which the API hides
  /// everywhere else; Realtime is the exception, because the subscription is
  /// to the table itself.
  Stream<Message> incoming(String kind, String threadId) {
    final table = kind == 'group' ? 'group_messages' : 'enquiry_messages';
    final fk = kind == 'group' ? 'request_id' : 'enquiry_id';

    final controller = StreamController<Message>();

    final channel = supabase
        .channel('thread:$kind:$threadId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: table,
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: fk,
            value: threadId,
          ),
          callback: (payload) {
            controller.add(Message.fromRealtime(payload.newRecord));
          },
        )
        .subscribe();

    controller.onCancel = () => supabase.removeChannel(channel);
    return controller.stream;
  }
}
