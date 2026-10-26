import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/alerts.dart';
import '../../data/models/coach.dart';
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
    ref.watch(themeModeProvider);
    final profile = ref.watch(myProfileProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.coral,
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
            // Neither _WaitingOnYou nor _Suggested is `const`: both read A91
            // colours, and HomeScreen is rebuilt fresh on a theme change
            // (see seeker_shell.dart's tab list) specifically so it reaches
            // this far — a const instance here would be the one thing in
            // its way.
            children: [
              _Header(profile: profile.value),
              // ignore: prefer_const_constructors
              _WaitingOnYou(),
              // ignore: prefer_const_constructors
              _Suggested(),
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
          // Not `const`: Eyebrow's style reads A91.gold.
          // ignore: prefer_const_constructors
          Eyebrow('Your search'),
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
              style: TextStyle(color: A91.muted, fontSize: 13.5),
            ),
          ],
          // The one switch worth surfacing here: off means no coach will ever
          // see them, and somebody who set it months ago will not remember.
          if (profile != null && !profile!.openToOffers) ...[
            const SizedBox(height: 14),
            _Notice(
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
      child: Material(
        color: A91.surface,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          // Every item this card lists lives in Messages — its own closing
          // line says so — so the whole card goes there rather than needing
          // its own menu of which item leads where.
          onTap: () =>
              ref.read(seekerTabRequestProvider.notifier).request(2),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: A91.border),
              boxShadow: A91.cardShadow,
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
                      style: TextStyle(color: A91.muted, fontSize: 13.5),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  'They are all in Messages.',
                  style: TextStyle(color: A91.faint, fontSize: 12.5),
                ),
              ],
            ),
          ),
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
    final referenceState = ref.watch(referenceProvider);
    final reference = referenceState.value;

    // Suggestions cannot be laid out until the taxonomy has loaded: without
    // it, coach cards cannot name their services. Keep the space visibly
    // loading during that first request instead of leaving an empty gap and
    // starting the shimmer only after referenceProvider completes.
    if (reference == null) {
      if (referenceState.isLoading) return _suggestionsSkeleton();
      return const SizedBox.shrink();
    }

    return suggestions.when(
      loading: _suggestionsSkeleton,
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
                    style: TextStyle(color: A91.faint, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            // _SuggestionCard's own card no longer stretches to fill this —
            // it sizes to its own content, so this is a ceiling, not a
            // target. 286 covers the worst case: a long area name wrapping
            // the location line to two lines, a 3-line bio, the tag row,
            // and a 2-line match reason underneath the card, all at once.
            SizedBox(
              height: 286,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: result.suggestions.length,
                itemBuilder: (context, i) {
                  final suggestion = result.suggestions[i];
                  return SizedBox(
                    width: 360,
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

  Widget _suggestionsSkeleton() => const Padding(
        padding: EdgeInsets.only(top: 18),
        // Matches the real strip's height (see below) so the page does not
        // visibly grow or shrink the moment the real cards load in.
        child: SizedBox(height: 286, child: ListSkeleton(rows: 1)),
      );

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
        mainAxisSize: MainAxisSize.min,
        children: [
          // Not Expanded: the card sizes to its own content. Its tags are
          // capped to one scrollable row rather than the Wrap the full
          // CoachCard uses, specifically so that height stays predictable
          // regardless of how many services a coach lists — Expanded was
          // forcing the card to stretch and fill the whole strip height
          // regardless, leaving visible empty space inside the card's own
          // border whenever a coach's content came in shorter than the
          // strip's worst case.
          _SuggestionCoachCard(
            coach: suggestion.coach,
            reference: reference,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ThemeAware(
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
                style: TextStyle(
                    color: A91.gold, fontSize: 11.5, height: 1.4),
              ),
            ),
        ],
      );
}

/// The suggestion strip's own compact card — not the full CoachCard search
/// uses. That one Wraps its tags across however many rows they need; fine in
/// a vertical list where the card is free to be as tall as it needs, wrong
/// in a fixed-height horizontal strip where every card has to fit the same
/// box. This one caps the bio at three lines and the tags at one scrollable
/// row instead, with a "See more" link underneath, so its height is fixed
/// and predictable rather than a function of how much a particular coach
/// wrote or how many services they listed.
///
/// "See more" has no onTap of its own — it sits inside the same InkWell as
/// the rest of the card, so tapping it opens the coach's page exactly like
/// tapping anywhere else on the card already does. It exists to tell
/// someone there is more to read, not to be a second, different button.
class _SuggestionCoachCard extends StatelessWidget {
  const _SuggestionCoachCard({
    required this.coach,
    required this.reference,
    required this.onTap,
  });

  final CoachResult coach;
  final Reference reference;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fees = formatFees(coach.feeMin, coach.feeMax, coach.feePeriod);
    // Suggestions are centred on the family's own location, so a distance
    // here always means something — unlike plain search, which only shows
    // one once a real lat/lng narrowed the results.
    final distance = formatDistance(coach.distanceKm);
    final experience = formatExperience(coach.experienceYears);
    final helpStatement = coach.helpStatement?.trim();
    // Four is what CoachCard caps a wrapped row at before the row wraps
    // into a paragraph; kept here too even though this row never wraps —
    // more than that in one scrollable line is more scrolling than
    // reading.
    final services = coach.serviceCategoryIds.take(4).toList();
    final moreServices = coach.serviceCategoryIds.length - services.length;

    return Container(
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
        boxShadow: A91.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CoachAvatar(coach: coach),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  coach.displayName ?? 'Unnamed',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: A91.ink,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              if (coach.isFeatured) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: A91.warn.withValues(alpha: 0.14),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    'Featured',
                                    style: TextStyle(
                                        color: A91.warn,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          // Area and distance on one line when they fit —
                          // "Indirapuram · 0 m away" — and experience alone
                          // on the next, rather than distance and experience
                          // sharing a line: that pair is the one most likely
                          // to run long enough to wrap onto a third line in
                          // this card's width.
                          //
                          // A Wrap of two whole Text widgets, not one long
                          // string left to wrap itself: a single Text only
                          // knows how to break between individual words, so
                          // "0 m away" could — and did — split into "0 m" on
                          // one line and "away" alone on the next even with
                          // visible room to spare, because the line-breaker
                          // has no idea those three words are one unit. Wrap
                          // treats each child as indivisible, so "0 m away"
                          // either sits whole on the first line or moves
                          // whole to the second — it can never fracture
                          // itself across the two.
                          if (coach.nearestAreaName != null ||
                              distance != null) ...[
                            const SizedBox(height: 3),
                            Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                if (coach.nearestAreaName != null)
                                  Text(
                                    coach.nearestAreaName!,
                                    style: TextStyle(
                                        color: A91.muted, fontSize: 12.5),
                                  ),
                                if (coach.nearestAreaName != null &&
                                    distance != null)
                                  // Single spaces, not double: every pixel
                                  // here is one "0 m away" needs to have any
                                  // chance of fitting on the same line as
                                  // the area name instead of wrapping whole.
                                  Text(
                                    ' · ',
                                    style: TextStyle(
                                        color: A91.muted, fontSize: 12.5),
                                  ),
                                if (distance != null)
                                  Text(
                                    distance,
                                    style: TextStyle(
                                        color: A91.muted, fontSize: 12.5),
                                  ),
                              ],
                            ),
                          ],
                          if (experience != null) ...[
                            const SizedBox(height: 3),
                            Text(
                              experience,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  color: A91.faint, fontSize: 11.5),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (fees != null) ...[
                      const SizedBox(width: 10),
                      // Fixed width, wrapping to two lines rather than one
                      // unconstrained line: "₹1000–₹3000 /hour" at its
                      // natural width was wide enough to squeeze the name
                      // and location column in the Expanded sibling down to
                      // almost nothing, which is why even short text like
                      // "6 yrs experience" was the one getting cut, not just
                      // the long combined location line. 84, not 68: the
                      // amount itself ("₹1000–₹3000") needs that much to fit
                      // on its own first line — any narrower and it breaks
                      // mid-number instead of wrapping at the space before
                      // "/hour", which is the one place it should break.
                      SizedBox(
                        width: 84,
                        child: Text(
                          fees,
                          textAlign: TextAlign.right,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: A91.ink,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                if (helpStatement != null && helpStatement.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    helpStatement,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(color: A91.muted, fontSize: 13.5, height: 1.5),
                  ),
                ],
                if (services.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  // One scrollable row, not a Wrap: a Wrap wants to run onto
                  // a second row the moment the tags stop fitting, which is
                  // exactly the unpredictable height this card's whole
                  // redesign exists to avoid. Scrolling sideways to see a
                  // fourth or fifth service costs nothing a fixed-height
                  // strip can't afford to give back.
                  // ServiceTag's own padding (5 top + 5 bottom) plus its
                  // text line reaches a little past 24, so that was clipping
                  // the top and bottom of every pill instead of showing the
                  // full rounded shape — 28 clears it with room to spare.
                  SizedBox(
                    height: 28,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      physics: const ClampingScrollPhysics(),
                      children: [
                        for (final id in services) ...[
                          ServiceTag(
                            label: reference.serviceName(id),
                            dot: A91.group(reference.service(id)?.group),
                          ),
                          const SizedBox(width: 6),
                        ],
                        if (moreServices > 0)
                          ServiceTag(label: '+$moreServices more'),
                      ],
                    ),
                  ),
                ],
                if (helpStatement != null && helpStatement.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      'See more',
                      style: TextStyle(
                        color: A91.coral,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
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
