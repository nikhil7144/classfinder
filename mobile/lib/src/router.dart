import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/sign_in_screen.dart';
import 'features/students/students_screen.dart';
import 'features/shell/gate_screen.dart';
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
          builder: (_, __) => const GateScreen(child: StudentsScreen())),
    ],
  );
});

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
