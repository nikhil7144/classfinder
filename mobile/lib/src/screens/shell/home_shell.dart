import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers.dart';
import '../../push.dart';
import '../../theme/theme.dart';
import '../../widgets/notification_bell.dart';
import '../queries/queries_screen.dart';
import 'more_screen.dart';
import '../space/space_screen.dart';
import '../students/students_screen.dart';
import '../threads/threads_screen.dart';

/// The four places a coach lives daily, plus everything else.
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
  void initState() {
    super.initState();
    // Reaching this shell at all means the account is signed in and
    // belongs here — exactly the "every launch" condition registration
    // needs. Fire-and-forget: registerDevice() swallows its own errors
    // and is a no-op when Firebase never initialized.
    unawaited(ref.read(pushServiceProvider).registerDevice());
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(themeModeProvider);
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
      // IndexedStack keeps every tab's scroll position, which is the whole
      // reason for it — but switching between them was a hard cut. The fade
      // is short enough not to be waited on and long enough to read as a
      // change rather than a glitch.
      // A Stack rather than an IndexedStack, and rather than an
      // AnimatedSwitcher.
      //
      // Every tab has to stay alive: a coach who scrolls the demand feed,
      // reads a message and comes back should find it where they left it.
      // AnimatedSwitcher would keyed-rebuild the whole stack on each switch
      // and throw exactly that away, which is the thing IndexedStack was there
      // to prevent. Opacity keeps them all mounted, and Flutter skips painting
      // a subtree at zero, so the cost is what IndexedStack's already was.
      body: Stack(
        children: [
          for (var i = 0; i < 5; i++)
            AnimatedOpacity(
              opacity: _tab == i ? 1 : 0,
              duration: A91.tabFade,
              curve: Curves.easeOut,
              child: IgnorePointer(
                ignoring: _tab != i,
                // Stops animations and timers on the tabs nobody is looking at.
                child: TickerMode(
                  enabled: _tab == i,
                  // Not `const`: HomeShell itself is rebuilt fresh on every
                  // theme change (see router.dart's ThemeAware), and a const
                  // instance here would be the one thing stopping that
                  // rebuild from reaching these five screens — Flutter skips
                  // a child it can see is identical to last time.
                  // ignore: prefer_const_literals_to_create_immutables
                  child: [
                    StudentsScreen(), // ignore: prefer_const_constructors
                    QueriesScreen(), // ignore: prefer_const_constructors
                    ThreadsScreen(), // ignore: prefer_const_constructors
                    SpaceScreen(), // ignore: prefer_const_constructors
                    MoreScreen(), // ignore: prefer_const_constructors
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
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          // Opening a list is the moment its numbers are most likely stale.
          if (i == 1) {
            // Not on first launch — see push.dart's requestPermission()
            // and README §11. Opening Queries, the worklist this
            // notification exists for, is the first moment a coach would
            // understand why the app is asking.
            unawaited(ref.read(pushServiceProvider).requestPermission());
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
              backgroundColor: A91.coral,
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
              backgroundColor: A91.coral,
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
            // The listing and events live behind here — a NavigationBar takes
            // five destinations and the app has six things. A listing waiting
            // on approval is the one a coach is most likely to be checking
            // for, so the dot follows it up to the bar.
            icon: Badge(
              isLabelVisible: needsAttention,
              backgroundColor: A91.warn,
              child: const Icon(Icons.more_horiz),
            ),
            selectedIcon: const Icon(Icons.more_horiz),
            label: 'More',
          ),
        ],
      ),
    );
  }
}
