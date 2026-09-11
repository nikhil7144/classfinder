import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/me.dart';
import '../../flavor.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/states.dart';
import '../auth/choose_role_screen.dart';

/// What happens between signing in and seeing the app.
///
/// Four answers, and the app has to be honest about all of them:
///
///   * the right role for this build — through to the app,
///   * the other side of the marketplace — told plainly, and pointed at the
///     other app. Never offered a role switch: switch_role() deletes the row
///     for the role being left, and offering that to somebody who simply
///     installed the wrong app would destroy a finished listing,
///   * no role chosen yet — asked, on the spot. That used to be a dead end
///     pointing at the website; PUT /me/role made it a screen,
///   * a read that failed — say so, offer to retry.
class GateScreen extends ConsumerWidget {
  const GateScreen({super.key, required this.child});

  /// What to show once the account belongs here.
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);

    return me.when(
      loading: () => const Scaffold(body: Loading()),
      error: (error, _) => Scaffold(
        body: ErrorState(
          message: error is ApiException
              ? error.message
              : 'Something went wrong loading your account.',
          onRetry: () => ref.invalidate(meProvider),
        ),
      ),
      data: (me) {
        if (me.role == null) return const ChooseRoleScreen();
        if (!me.belongsIn(appFlavor.roles)) return _WrongApp(role: me.role!);
        return child;
      },
    );
  }
}

/// The wrong app for this account.
class _WrongApp extends StatelessWidget {
  const _WrongApp({required this.role});

  final Role role;

  @override
  Widget build(BuildContext context) {
    final coachApp = appFlavor.isProvider;

    return _Message(
      eyebrow: 'Wrong app',
      title: coachApp ? 'This is the coaches app' : 'This is the families app',
      body: coachApp
          ? 'You are signed in as a family. Install Aspire91 to find classes — '
              'this app is for coaches, academies and event organisers.'
          : 'You are signed in as a coach. Install Aspire91 for Coaches to see '
              'the families looking for you.',
    );
  }
}

/// One layout for the three dead ends, so they read alike.
class _Message extends ConsumerWidget {
  const _Message(
      {required this.eyebrow, required this.title, required this.body});

  final String eyebrow;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Align(
                        alignment: Alignment.centerLeft,
                        child: Wordmark(height: 34)),
                    const SizedBox(height: 34),
                    Eyebrow(eyebrow),
                    const SizedBox(height: 12),
                    Text(title,
                        style: Theme.of(context).textTheme.headlineLarge),
                    const SizedBox(height: 12),
                    Text(body,
                        style: const TextStyle(color: A91.muted, height: 1.6)),
                    const SizedBox(height: 28),
                    PrimaryButton(
                      label: 'Sign out',
                      onPressed: () =>
                          ref.read(authRepositoryProvider).signOut(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
