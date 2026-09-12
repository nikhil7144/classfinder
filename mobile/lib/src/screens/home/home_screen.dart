import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/alerts.dart';
import '../../data/models/reference.dart';
import '../../data/models/seeker.dart';
import '../../data/models/suggestion.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../coach/coach_screen.dart';
import '../search/coach_card.dart';

/// Where a family lands — /home.
///
/// Mostly a way into everywhere else, which is why it is built fourth rather
/// than first: search and the coach page are the reason somebody installs
/// this, and a home screen full of links to screens that do not exist is not
/// worth having.
///
/// What it adds is the two things no other screen says: what is waiting on
/// them, and who they should look at first.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(alertsProvider);
            ref.invalidate(myProfileProvider);
            ref.invalidate(coachSuggestionsProvider);
            await ref.read(myProfileProvider.future);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 28),
            children: [
              _Header(profile: profile.value),
              const _WaitingOnYou(),
              const _Suggested(),
            ],
          ),
        ),
      ),
    );
  }
}

/// What they said they were looking for, and a way back to change it.
class _Header extends ConsumerWidget {
  const _Header({required this.profile});

  final SeekerProfile? profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceProvider).value;
    final wanted = profile?.lookingFor ?? const <String>[];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('Your search'),
          const SizedBox(height: 10),
          Text(
            _heading(reference, wanted),
            style: Theme.of(context)
                .textTheme
                .headlineLarge
                ?.copyWith(fontSize: 26),
          ),
          if (profile?.areaId != null && reference != null) ...[
            const SizedBox(height: 8),
            Text(
              'in ${reference.areaLabel(profile!.areaId!)}',
              style: const TextStyle(color: A91.muted, fontSize: 13.5),
            ),
          ],
          // The one switch worth surfacing here: off means no coach will ever
          // see them, and somebody who set it months ago will not remember.
          if (profile != null && !profile!.openToOffers) ...[
            const SizedBox(height: 14),
            const _Notice(
              tone: A91.warn,
              text: 'Coaches cannot see you at the moment. Turn that back on '
                  'under You, and they can get in touch.',
            ),
          ],
        ],
      ),
    );
  }

  String _heading(Reference? reference, List<String> wanted) {
    if (wanted.isEmpty) return 'Find a coach near you';
    if (reference == null) return 'What you are looking for';

    final names = wanted.take(2).map(reference.serviceName).toList();
    final more = wanted.length - names.length;
    return more > 0
        ? '${names.join(', ')} and $more more'
        : names.join(' and ');
  }
}

/// The things that will not move until this family does something.
class _WaitingOnYou extends ConsumerWidget {
  const _WaitingOnYou();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A badge is decoration on a number that may not have loaded. No number is
    // better than a wrong one, so a failure shows nothing.
    final alerts = ref.watch(alertsProvider).value ?? Alerts.none;

    final items = <(String, int)>[
      ('coaches waiting on your answer', alerts.pendingApproaches),
      ('unread conversations', alerts.unreadThreads),
      ('coaches who pitched to your group', alerts.pendingPitches),
    ].where((e) => e.$2 > 0).toList();

    if (items.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: A91.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Waiting on you',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 10),
            for (final (label, count) in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(
                  '$count $label',
                  style: const TextStyle(color: A91.muted, fontSize: 13.5),
                ),
              ),
            const SizedBox(height: 4),
            const Text(
              'They are all in Messages.',
              style: TextStyle(color: A91.faint, fontSize: 12.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// Coaches worth looking at first.
///
/// A horizontal strip rather than a list, so it cannot be mistaken for search
/// results — the web makes the same choice, and for the same reason: a
/// vertical block of suggestions above a vertical block of results reads as
/// one long list where the top half is unexplained.
class _Suggested extends ConsumerWidget {
  const _Suggested();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suggestions = ref.watch(coachSuggestionsProvider);
    final reference = ref.watch(referenceProvider).value;

    if (reference == null) return const SizedBox.shrink();

    return suggestions.when(
      loading: () => const Padding(
        padding: EdgeInsets.only(top: 18),
        child: SizedBox(height: 210, child: ListSkeleton(rows: 1)),
      ),
      // Asking a model is the one call here that can fail on its own. A parent
      // still has search, which is what they had before, so this says nothing
      // rather than putting an error on the home screen.
      error: (_, __) => const SizedBox.shrink(),
      data: (result) {
        if (result.suggestions.isEmpty) return _empty(result.reason);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 26, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    result.ranked ? 'Picked for you' : 'Near you',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 5),
                  Text(
                    result.ranked
                        ? 'Matched against what you said you wanted.'
                        : 'Closest first.',
                    style: const TextStyle(color: A91.faint, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 250,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: result.suggestions.length,
                itemBuilder: (context, i) {
                  final suggestion = result.suggestions[i];
                  return SizedBox(
                    width: 300,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: _SuggestionCard(
                        suggestion: suggestion,
                        reference: reference,
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  /// Why there is nothing, said differently depending on whose move it is.
  Widget _empty(NoSuggestionsReason? reason) {
    final text = switch (reason) {
      NoSuggestionsReason.noRequirement =>
        'Say what you are looking for under You, and we will suggest coaches '
            'who match.',
      NoSuggestionsReason.noOrigin =>
        'Choose your area under You, and we will show you who is nearby.',
      NoSuggestionsReason.nothingNearby =>
        'Nobody nearby teaches that yet. Search a wider area to see who else '
            'is around.',
      // not_a_seeker, or no reason given. Neither is a parent's problem to
      // solve, so neither gets an instruction.
      _ => null,
    };

    if (text == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 26, 20, 0),
      child: _Notice(tone: A91.faint, text: text),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({required this.suggestion, required this.reference});

  final CoachSuggestion suggestion;
  final Reference reference;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: CoachCard(
              coach: suggestion.coach,
              reference: reference,
              // Suggestions are centred on the family's own location, so a
              // distance here always means something.
              showDistance: true,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => CoachScreen(coachId: suggestion.coach.id),
                ),
              ),
            ),
          ),
          // Why this coach, in the model's own words. Shown under the card
          // rather than inside it, because it is about the match and not about
          // the coach — and the same card appears in search with no reason at
          // all.
          if (suggestion.reason != null && suggestion.reason!.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
              child: Text(
                suggestion.reason!.trim(),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: A91.grad2, fontSize: 11.5, height: 1.4),
              ),
            ),
        ],
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.text});

  final Color tone;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: tone.withValues(alpha: 0.3)),
        ),
        child: Text(
          text,
          style: TextStyle(color: tone, fontSize: 12.5, height: 1.5),
        ),
      );
}
