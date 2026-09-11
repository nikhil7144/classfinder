import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/api.dart';
import 'data/models/me.dart';
import 'data/repositories/auth_repository.dart';
import 'data/models/demand.dart';
import 'data/repositories/me_repository.dart';
import 'data/models/alerts.dart';
import 'data/models/thread.dart';
import 'data/repositories/alerts_repository.dart';
import 'data/repositories/students_repository.dart';
import 'data/repositories/threads_repository.dart';

/// Everything the app can be handed.
///
/// Written by hand rather than with riverpod_generator: a provider somebody can
/// read is worth more than one build_runner writes, particularly to a reader
/// meeting Riverpod on this codebase for the first time.
///
/// This file is the seam. Below it, lib/src/data is pure Dart and imports
/// nothing from here; above it, screens read these and never construct a
/// repository themselves. That is what makes both halves testable — a test
/// overrides a provider, it does not reach into a singleton.

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authRepositoryProvider =
    Provider<AuthRepository>((ref) => const AuthRepository());

final meRepositoryProvider =
    Provider<MeRepository>((ref) => MeRepository(ref.watch(apiClientProvider)));

/// Whether there is a session, and when that changes.
///
/// Sourced from the Supabase stream rather than a bool the app keeps: a token
/// can expire while the phone sleeps, and the refresh can fail. Listening means
/// the router learns about it instead of the next screen discovering it with a
/// 401.
final authStateProvider = StreamProvider<bool>((ref) {
  final auth = ref.watch(authRepositoryProvider);
  return auth.changes.map((_) => auth.isSignedIn);
});

final studentsRepositoryProvider = Provider<StudentsRepository>(
  (ref) => StudentsRepository(ref.watch(apiClientProvider)),
);

/// Who the caller is. The gate every signed-in screen waits on.
///
/// Invalidated when the session changes, so signing out or signing in as
/// somebody else does not leave the previous person's role on screen.
final meProvider = FutureProvider<Me>((ref) async {
  ref.watch(authStateProvider);
  return ref.watch(meRepositoryProvider).me();
});

/// The coach's demand feed.
///
/// Depends on meProvider for the listing id rather than taking one: a screen
/// should not have to carry an identifier the account already knows, and a
/// coach with no listing yet has no feed to ask for.
final demandFeedProvider = FutureProvider<List<Demand>>((ref) async {
  final me = await ref.watch(meProvider.future);
  final providerId = me.provider?.id;

  // Not an error. A coach who has chosen their role but not filled in a
  // listing has nothing to see, and the screen says so rather than failing.
  if (providerId == null) return const [];

  return ref.watch(studentsRepositoryProvider).feed(providerId: providerId);
});

final threadsRepositoryProvider = Provider<ThreadsRepository>(
  (ref) => ThreadsRepository(ref.watch(apiClientProvider)),
);

final alertsRepositoryProvider = Provider<AlertsRepository>(
  (ref) => AlertsRepository(ref.watch(apiClientProvider)),
);

/// Every conversation the caller is in.
final inboxProvider = FutureProvider<List<Thread>>(
  (ref) => ref.watch(threadsRepositoryProvider).inbox(),
);

/// One conversation's history. The live messages arrive separately — see
/// incomingProvider — because a refetch and a delivery are different events
/// and merging them here would re-read the thread on every keystroke somebody
/// else makes.
final messagesProvider =
    FutureProvider.family<List<Message>, ThreadKey>((ref, key) async {
  final messages =
      await ref.watch(threadsRepositoryProvider).messages(key.kind, key.id);
  // Opening a thread is reading it. Fire and forget: a failure here should not
  // stop the conversation rendering.
  unawaited(ref.read(threadsRepositoryProvider).markRead(key.kind, key.id));
  return messages;
});

/// New messages as they land, straight from Postgres.
final incomingProvider = StreamProvider.family<Message, ThreadKey>((ref, key) {
  return ref.watch(threadsRepositoryProvider).incoming(key.kind, key.id);
});

/// The badge numbers. Re-read whenever the inbox is, so a thread opened on
/// this device does not leave a stale count on the tab behind it.
final alertsProvider = FutureProvider<Alerts>((ref) async {
  try {
    return await ref.watch(alertsRepositoryProvider).mine();
  } catch (_) {
    // A badge is not worth an error screen. No number is better than a red one.
    return Alerts.none;
  }
});

/// Names a conversation. threadId is unique within its kind and not across
/// both, so neither half identifies one on its own.
class ThreadKey {
  const ThreadKey(this.kind, this.id);

  final String kind;
  final String id;

  @override
  bool operator ==(Object other) =>
      other is ThreadKey && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);
}
