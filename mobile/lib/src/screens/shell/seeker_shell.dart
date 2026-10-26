import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers.dart';
import '../../push.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/notification_bell.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/skeleton.dart';
import '../home/home_screen.dart';
import '../profile/profile_screen.dart';
import 'account_screen.dart';
import '../search/search_screen.dart';
import '../threads/threads_screen.dart';

/// Where a family lands.
///
/// Four tabs: Home, Find, Messages, You.
///
/// The bar stops growing here. A NavigationBar takes five destinations and the
/// four things opened every day earn those places, so the profile, groups and
/// everything else live behind You — the same shape the coach app reached, for
/// the same reason.
///
/// A brand new account gets the welcome instead: the profile asks for a
/// child's age and a neighbourhood, and a blank form is a poor way to open
/// that conversation.
class SeekerShell extends ConsumerStatefulWidget {
  const SeekerShell({super.key});

  @override
  ConsumerState<SeekerShell> createState() => _SeekerShellState();
}

class _SeekerShellState extends ConsumerState<SeekerShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Reaching this shell at all means the account is signed in — exactly
    // the "every launch" condition registration needs. Fire-and-forget:
    // registerDevice() swallows its own errors and is a no-op when
    // Firebase never initialized.
    unawaited(ref.read(pushServiceProvider).registerDevice());
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(themeModeProvider);
    final profile = ref.watch(myProfileProvider);

    // A tab a nested screen asked for — the "Waiting on you" card on Home,
    // which has no other way to reach this shell's own NavigationBar state.
    ref.listen(seekerTabRequestProvider, (_, next) {
      if (next == null) return;
      setState(() => _tab = next);
      ref.read(seekerTabRequestProvider.notifier).clear();
    });

    // hasValue, not just isLoading: isLoading is also true while an already-
    // loaded profile is being silently re-fetched — Home's pull-to-refresh
    // does exactly that (ref.invalidate(myProfileProvider)). Checking
    // isLoading alone tore down the whole shell — nav bar, all four tabs —
    // and replaced it with this skeleton on every pull-to-refresh, mid-drag,
    // which is what an "isLoading" gate is for on first launch, never for a
    // background refresh of a screen already on-screen.
    if (profile.isLoading && !profile.hasValue) {
      return const Scaffold(body: FormSkeleton(sections: 2));
    }
    // A failure to read the profile is not a reason to lock somebody out of
    // their own account — the form behind this can still write one.
    // Not `const`: _Welcome reads A91 colours directly.
    if (profile.hasValue && profile.value == null) {
      // ignore: prefer_const_constructors
      return _Welcome();
    }

    return Scaffold(
      // A Stack rather than an IndexedStack, and rather than an
      // AnimatedSwitcher.
      //
      // Every tab has to stay alive: a parent who scrolls a list, opens
      // another tab and comes back should find it where they left it.
      // AnimatedSwitcher would keyed-rebuild the whole stack on each switch
      // and throw exactly that away, which is the thing IndexedStack was there
      // to prevent. Opacity keeps them all mounted, and Flutter skips painting
      // a subtree at zero, so the cost is what IndexedStack's already was.
      body: Stack(
        children: [
          for (var i = 0; i < 4; i++)
            AnimatedOpacity(
              opacity: _tab == i ? 1 : 0,
              duration: A91.tabFade,
              curve: Curves.easeOut,
              child: IgnorePointer(
                ignoring: _tab != i,
                // Stops animations and timers on the tabs nobody is looking at.
                child: TickerMode(
                  enabled: _tab == i,
                  // Not `const`: SeekerShell itself is rebuilt fresh on every
                  // theme change (see router.dart's ThemeAware), and a const
                  // instance here would be the one thing stopping that
                  // rebuild from reaching these four screens — Flutter skips
                  // a child it can see is identical to last time.
                  // ignore: prefer_const_literals_to_create_immutables
                  child: [
                    HomeScreen(), // ignore: prefer_const_constructors
                    SearchScreen(), // ignore: prefer_const_constructors
                    ThreadsScreen(), // ignore: prefer_const_constructors
                    AccountScreen(), // ignore: prefer_const_constructors
                  ][i],
                ),
              ),
            ),
          // Outside the per-tab AnimatedOpacity loop on purpose: the bell
          // is the same control on every tab, not one more thing each tab
          // owns, so it should not fade in and out as _tab changes.
          const NotificationBell(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: A91.surface,
        indicatorColor: A91.surface3,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.search),
            selectedIcon: Icon(Icons.search),
            label: 'Find',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Messages',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'You',
          ),
        ],
      ),
    );
  }
}

/// The first screen of a brand new account.
///
/// A blank form is a poor greeting, and the profile is asking for a child's
/// age and a neighbourhood before it has said why. This says why first.
class _Welcome extends StatelessWidget {
  const _Welcome();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Not `const`: Wordmark picks its asset from A91.isLight.
                    // ignore: prefer_const_constructors
                    Align(
                      alignment: Alignment.centerLeft,
                      // ignore: prefer_const_constructors
                      child: Wordmark(height: 34),
                    ),
                    const SizedBox(height: 34),
                    // Not `const`: Eyebrow's style reads A91.gold.
                    // ignore: prefer_const_constructors
                    Eyebrow('Welcome'),
                    const SizedBox(height: 12),
                    Text(
                      'Tell us what you are looking for',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Your area and what you want taught. Coaches near you '
                      'can then find you — and you can search for them '
                      'yourself either way.',
                      style: TextStyle(color: A91.muted, height: 1.6),
                    ),
                    const SizedBox(height: 28),
                    Builder(
                      builder: (context) => PrimaryButton(
                        label: 'Get started',
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ThemeAware(
                              // ignore: prefer_const_constructors
                              builder: (_) => ProfileScreen(),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
