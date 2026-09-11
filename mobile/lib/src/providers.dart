import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/api.dart';
import 'data/models/me.dart';
import 'data/repositories/auth_repository.dart';
import 'data/repositories/me_repository.dart';

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

/// Who the caller is. The gate every signed-in screen waits on.
///
/// Invalidated when the session changes, so signing out or signing in as
/// somebody else does not leave the previous person's role on screen.
final meProvider = FutureProvider<Me>((ref) async {
  ref.watch(authStateProvider);
  return ref.watch(meRepositoryProvider).me();
});
