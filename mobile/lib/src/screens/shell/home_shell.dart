import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers.dart';
import '../../theme/theme.dart';
import '../listing/listing_screen.dart';
import '../queries/queries_screen.dart';
import '../space/space_screen.dart';
import '../students/students_screen.dart';
import '../threads/threads_screen.dart';

/// The five places a coach lives, behind one bar.
///
/// An IndexedStack rather than swapping the body, so the demand feed keeps its
/// scroll position while somebody reads a message and comes back. Detail
/// screens push over the whole shell, which is why the bar does not follow
/// them — a conversation is not a tab.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    // A badge is decoration on a number that may not have loaded. No count is
    // better than a wrong one, so a failure shows nothing rather than zero.
    final alerts = ref.watch(alertsProvider).value;
    final unread = alerts?.unreadThreads ?? 0;
    final waiting = alerts?.unreadQueries ?? 0;

    // A coach with no listing, or one still waiting, has something to do here.
    // A dot rather than a number: there is only ever one listing.
    final provider = ref.watch(meProvider).value?.provider;
    final needsAttention = provider == null || !provider.approved;

    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: const [
          StudentsScreen(),
          QueriesScreen(),
          ThreadsScreen(),
          SpaceScreen(),
          ListingScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          // Opening a list is the moment its numbers are most likely stale.
          if (i == 1) {
            ref.invalidate(queriesProvider);
            ref.invalidate(alertsProvider);
          }
          if (i == 2) {
            ref.invalidate(inboxProvider);
            ref.invalidate(alertsProvider);
          }
        },
        backgroundColor: A91.surface,
        indicatorColor: A91.surface3,
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Students',
          ),
          NavigationDestination(
            // Before Messages on purpose, and the web says why: a parent who
            // left a number is waiting on a call, not on a reply, and that is
            // the more perishable of the two.
            icon: Badge(
              isLabelVisible: waiting > 0,
              label: Text('$waiting'),
              backgroundColor: A91.grad1,
              textColor: A91.onAccent,
              child: const Icon(Icons.call_outlined),
            ),
            selectedIcon: const Icon(Icons.call),
            label: 'Queries',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              backgroundColor: A91.grad1,
              textColor: A91.onAccent,
              child: const Icon(Icons.chat_bubble_outline),
            ),
            selectedIcon: const Icon(Icons.chat_bubble),
            label: 'Messages',
          ),
          const NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Space',
          ),
          NavigationDestination(
            // A listing waiting on approval is the one thing a coach is most
            // likely to be checking for, so the tab says so.
            icon: Badge(
              isLabelVisible: needsAttention,
              backgroundColor: A91.warn,
              child: const Icon(Icons.badge_outlined),
            ),
            selectedIcon: const Icon(Icons.badge),
            label: 'Listing',
          ),
        ],
      ),
    );
  }
}
