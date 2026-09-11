import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/auth/sign_in_screen.dart';
import 'data/models/demand.dart';
import 'screens/students/demand_detail_screen.dart';
import 'data/models/thread.dart';
import 'flavor.dart';
import 'screens/shell/home_shell.dart';
import 'screens/shell/seeker_shell.dart';
import 'screens/threads/thread_screen.dart';
import 'screens/shell/gate_screen.dart';
import 'providers.dart';

/// Where the app is.
///
/// One redirect decides whether a person may be anywhere but sign-in, and it
/// reads the auth stream rather than a flag the screens keep. A token can
/// expire while the phone sleeps and its refresh can fail; when that happens
/// the router moves, instead of the next screen discovering it with a 401.
///
/// Sign-in itself never navigates. It creates a session and this reacts —
/// which means one place handles a session appearing, whether it came from a
/// code, from Google later, or from a refresh on launch.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authRepositoryProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthRefresh(ref),
    redirect: (context, state) {
      final signedIn = auth.isSignedIn;
      final onSignIn = state.matchedLocation == '/sign-in';

      if (!signedIn) return onSignIn ? null : '/sign-in';
      if (onSignIn) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/sign-in', builder: (_, __) => const SignInScreen()),
      // Everything past the gate is only reachable by an account whose role
      // belongs to this flavor.
      GoRoute(
        path: '/',
        builder: (_, __) => GateScreen(child: _shell()),
        routes: [
          // The row travels as extra rather than being refetched by id: the
          // list already holds it, and there is no deep link into this screen
          // to arrive without one. If that changes — a notification opening a
          // requirement — this wants a fetch-by-id endpoint, which does not
          // exist yet. Until then a missing extra falls back to the list
          // rather than crashing.
          GoRoute(
            path: 'demand',
            builder: (context, state) {
              final demand = state.extra;
              if (demand is! Demand) {
                return GateScreen(child: _shell());
              }
              return DemandDetailScreen(demand: demand);
            },
          ),
          GoRoute(
            path: 'thread',
            builder: (context, state) {
              final thread = state.extra;
              if (thread is! Thread) {
                return GateScreen(child: _shell());
              }
              return ThreadScreen(thread: thread);
            },
          ),
        ],
      ),
    ],
  );
});

/// Which app this is.
///
/// The two flavors share auth, the gate and the router, and diverge here. A
/// seeker in the coach shell would see five tabs built for somebody else — the
/// same mistake organisers were getting until the flavor stopped admitting
/// them.
Widget _shell() =>
    appFlavor.isProvider ? const HomeShell() : const SeekerShell();

/// Turns the auth stream into something GoRouter will listen to.
class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(Ref ref) {
    _sub = ref.listen(authStateProvider, (_, __) => notifyListeners());
  }

  late final ProviderSubscription<dynamic> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
