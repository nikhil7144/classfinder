import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/skeleton.dart';
import '../home/home_screen.dart';
import '../profile/profile_screen.dart';
import '../search/search_screen.dart';
import '../threads/threads_screen.dart';

/// Where a family lands.
///
/// Four tabs. SEEKER-SCREENS.md has what is left — groups, events and
/// settings — and the bar grows a destination per slice.
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
  Widget build(BuildContext context) {
    final profile = ref.watch(myProfileProvider);

    if (profile.isLoading) {
      return const Scaffold(body: FormSkeleton(sections: 2));
    }
    // A failure to read the profile is not a reason to lock somebody out of
    // their own account — the form behind this can still write one.
    if (profile.hasValue && profile.value == null) return const _Welcome();

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
                  child: const [
                    HomeScreen(),
                    SearchScreen(),
                    ThreadsScreen(),
                    ProfileScreen(),
                  ][i],
                ),
              ),
            ),
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
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Wordmark(height: 34),
                    ),
                    const SizedBox(height: 34),
                    const Eyebrow('Welcome'),
                    const SizedBox(height: 12),
                    Text(
                      'Tell us what you are looking for',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 12),
                    const Text(
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
                            builder: (_) => const ProfileScreen(),
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
