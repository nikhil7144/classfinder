import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/api.dart';
import 'data/models/me.dart';
import 'data/repositories/auth_repository.dart';
import 'data/models/demand.dart';
import 'data/repositories/me_repository.dart';
import 'data/models/alerts.dart';
import 'data/models/listing.dart';
import 'data/models/coach.dart';
import 'data/models/entry.dart';
import 'data/models/group.dart';
import 'data/models/event.dart';
import 'data/models/query.dart';
import 'data/models/reference.dart';
import 'data/models/seeker.dart';
import 'data/models/space.dart';
import 'data/models/suggestion.dart';
import 'data/models/thread.dart';
import 'data/models/trial.dart';
import 'data/repositories/alerts_repository.dart';
import 'data/repositories/listing_repository.dart';
import 'data/repositories/reference_repository.dart';
import 'data/repositories/coaches_repository.dart';
import 'data/repositories/enquiries_repository.dart';
import 'data/repositories/events_repository.dart';
import 'data/repositories/groups_repository.dart';
import 'data/repositories/queries_repository.dart';
import 'data/repositories/seeker_repository.dart';
import 'data/repositories/spaces_repository.dart';
import 'data/repositories/suggestions_repository.dart';
import 'data/repositories/students_repository.dart';
import 'data/repositories/threads_repository.dart';
import 'data/repositories/trials_repository.dart';

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

final referenceRepositoryProvider = Provider<ReferenceRepository>(
  (ref) => ReferenceRepository(ref.watch(apiClientProvider)),
);

final listingRepositoryProvider = Provider<ListingRepository>(
  (ref) => ListingRepository(ref.watch(apiClientProvider)),
);

/// Cities, areas and the taxonomy.
///
/// Read once and kept for the session. It is public, identical for everybody,
/// and changes only when an admin edits it — so it is not invalidated by
/// anything the coach does, and the pickers never wait on a network call.
final referenceProvider = FutureProvider<Reference>(
  (ref) => ref.watch(referenceRepositoryProvider).all(),
);

/// The coach's own listing, or null if they have not started one.
///
/// Null is a state, not a failure. A coach who has chosen their role has an
/// account and no provider row until the first save writes one.
final myListingProvider = FutureProvider<Listing?>((ref) async {
  ref.watch(authStateProvider);
  return ref.watch(listingRepositoryProvider).mine();
});

final coachesRepositoryProvider = Provider<CoachesRepository>(
  (ref) => CoachesRepository(ref.watch(apiClientProvider)),
);

final enquiriesRepositoryProvider = Provider<EnquiriesRepository>(
  (ref) => EnquiriesRepository(ref.watch(apiClientProvider)),
);

/// Search results for one set of filters.
///
/// Keyed on the whole query, so changing any part of it re-runs the search and
/// changing none of it does not.
final searchProvider =
    FutureProvider.family<List<CoachResult>, SearchQuery>((ref, query) {
  if (!query.isReady) return Future.value(const []);
  return ref.watch(coachesRepositoryProvider).search(query);
});

/// One coach's page.
final coachProvider = FutureProvider.family<CoachProfile, String>(
  (ref, id) => ref.watch(coachesRepositoryProvider).one(id),
);

final groupsRepositoryProvider = Provider<GroupsRepository>(
  (ref) => GroupsRepository(ref.watch(apiClientProvider)),
);

/// Every group the caller is in, made or joined.
final myGroupsProvider = FutureProvider<List<Group>>(
  (ref) => ref.watch(groupsRepositoryProvider).mine(),
);

/// The coaches who have pitched to one group.
final groupPitchesProvider = FutureProvider.family<List<GroupPitch>, String>(
  (ref, groupId) => ref.watch(groupsRepositoryProvider).pitches(groupId),
);

final eventsRepositoryProvider = Provider<EventsRepository>(
  (ref) => EventsRepository(ref.watch(apiClientProvider)),
);

/// The caller's own events, whichever state they are in.
final myEventsProvider = FutureProvider<List<Event>>(
  (ref) => ref.watch(eventsRepositoryProvider).mine(),
);

/// The register for one event.
final entriesProvider = FutureProvider.family<List<Entry>, String>(
  (ref, eventId) => ref.watch(eventsRepositoryProvider).entries(eventId),
);

/// Somebody else's Space, and its posts. Keyed on the provider because that is
/// what a client arrives holding — from search, or from a profile.
final spaceProvider = FutureProvider.family<Space, String>(
  (ref, providerId) => ref.watch(spacesRepositoryProvider).one(providerId),
);

final spacePostsProvider = FutureProvider.family<List<SpacePost>, String>(
  (ref, providerId) => ref.watch(spacesRepositoryProvider).posts(providerId),
);

/// The Spaces a family follows.
final followedSpacesProvider = FutureProvider<List<FollowedSpace>>(
  (ref) => ref.watch(spacesRepositoryProvider).following(),
);

final suggestionsRepositoryProvider = Provider<SuggestionsRepository>(
  (ref) => SuggestionsRepository(ref.watch(apiClientProvider)),
);

/// Coaches worth looking at first. Asks the model, so it is not cheap — read
/// once per home screen rather than on every rebuild.
final coachSuggestionsProvider = FutureProvider<CoachSuggestions>(
  (ref) => ref.watch(suggestionsRepositoryProvider).coaches(),
);

final queriesRepositoryProvider = Provider<QueriesRepository>(
  (ref) => QueriesRepository(ref.watch(apiClientProvider)),
);

/// Every lead the caller is party to, newest first.
final queriesProvider = FutureProvider<List<Query>>(
  (ref) => ref.watch(queriesRepositoryProvider).mine(),
);

final seekerRepositoryProvider = Provider<SeekerRepository>(
  (ref) => SeekerRepository(ref.watch(apiClientProvider)),
);

/// The caller's own profile, or null if they have not started one.
///
/// Null is a state, not a failure — the same shape myListingProvider has on
/// the coach side.
final myProfileProvider = FutureProvider<SeekerProfile?>((ref) async {
  ref.watch(authStateProvider);
  return ref.watch(seekerRepositoryProvider).mine();
});

final spacesRepositoryProvider = Provider<SpacesRepository>(
  (ref) => SpacesRepository(ref.watch(apiClientProvider)),
);

/// The caller's own Space.
///
/// Depends on meProvider for the provider id for the same reason the demand
/// feed does: a coach should not have to carry an identifier their account
/// already knows, and one with no listing has no Space to ask for.
final mySpaceProvider = FutureProvider<Space?>((ref) async {
  final me = await ref.watch(meProvider.future);
  final providerId = me.provider?.id;
  if (providerId == null) return null;
  return ref.watch(spacesRepositoryProvider).one(providerId);
});

/// The posts on the caller's own Space. Newest first.
final mySpacePostsProvider = FutureProvider<List<SpacePost>>((ref) async {
  final space = await ref.watch(mySpaceProvider.future);
  if (space == null) return const [];
  return ref.watch(spacesRepositoryProvider).posts(space.providerId);
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

final trialsRepositoryProvider = Provider<TrialsRepository>(
  (ref) => TrialsRepository(ref.watch(apiClientProvider)),
);

/// The trials arranged in one conversation.
final trialsProvider = FutureProvider.family<List<Trial>, ThreadKey>(
  (ref, key) => ref.watch(trialsRepositoryProvider).forThread(key.kind, key.id),
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
///
/// A pure read. Marking the thread read is the screen's job, not this one's:
/// it has to invalidate the inbox afterwards to clear the dot and the badge,
/// and a provider that quietly writes on every rebuild is the wrong place for
/// that.
final messagesProvider = FutureProvider.family<List<Message>, ThreadKey>(
  (ref, key) => ref.watch(threadsRepositoryProvider).messages(key.kind, key.id),
);

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
