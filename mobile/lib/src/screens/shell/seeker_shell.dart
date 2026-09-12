import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/states.dart';
import '../profile/profile_screen.dart';
import '../search/search_screen.dart';

/// Where a family lands.
///
/// Two tabs so far. SEEKER-SCREENS.md has the build order — messages, then
/// home, groups and events — and the bar grows a destination per slice.
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

    if (profile.isLoading) return const Scaffold(body: Loading());
    // A failure to read the profile is not a reason to lock somebody out of
    // their own account — the form behind this can still write one.
    if (profile.hasValue && profile.value == null) return const _Welcome();

    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: const [SearchScreen(), ProfileScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: A91.surface,
        indicatorColor: A91.surface3,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.search),
            selectedIcon: Icon(Icons.search),
            label: 'Find',
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
