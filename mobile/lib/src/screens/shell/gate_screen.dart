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
///
/// Three ways to be in the wrong place, and they are not the same message. A
/// family in the coach app has another app to install; an organiser has a
/// website, because running events is a desk job this app deliberately does
/// not do; an admin has neither.
///
/// Naming the actual role matters. Telling an organiser they are "signed in as
/// a family" is the kind of wrong that makes somebody think the account is
/// broken rather than the app is the wrong one.
class _WrongApp extends StatelessWidget {
  const _WrongApp({required this.role});

  final Role role;

  @override
  Widget build(BuildContext context) {
    if (role == Role.organiser) {
      return const _Message(
        eyebrow: 'Not in the app',
        title: 'Events are run on the website',
        body: 'You are signed in as an event organiser. Dates, venues, fee '
            'tiers and the register are a desk job, so they live at '
            'www.aspire91.com — sign in there with this same email.',
      );
    }

    if (role == Role.admin) {
      return const _Message(
        eyebrow: 'Not in the app',
        title: 'Admin is on the website',
        body: 'Moderation and approvals want a big screen and a keyboard. '
            'Sign in at www.aspire91.com.',
      );
    }

    return _Message(
      eyebrow: 'Wrong app',
      title: appFlavor.isProvider
          ? 'This is the coaches app'
          : 'This is the families app',
      body: appFlavor.isProvider
          ? 'You are signed in as a family. Install Aspire91 to find classes — '
              'this app is for coaches and academies.'
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
