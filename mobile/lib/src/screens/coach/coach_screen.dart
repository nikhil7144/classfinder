import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/coach.dart';
import '../../data/models/seeker.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import 'coach_space_tab.dart';
import 'contact_sheet.dart';

/// A coach's page — /provider/[id] and /provider/[id]/space.
///
/// Two tabs rather than one page with a section, and the web's comment says
/// why: a Space paginates and the profile does not, and an event planner has a
/// Space with no profile behind it.
class CoachScreen extends ConsumerWidget {
  const CoachScreen({super.key, required this.coachId});

  final String coachId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coach = ref.watch(coachProvider(coachId));

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            coach.value?.displayName ?? 'Coach',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          bottom: const TabBar(
            indicatorColor: A91.grad1,
            labelColor: A91.ink,
            unselectedLabelColor: A91.faint,
            tabs: [Tab(text: 'Profile'), Tab(text: 'Space')],
          ),
        ),
        body: coach.when(
          loading: () => const DetailSkeleton(),
          error: (error, _) => ErrorState(
            message: error is ApiException
                ? error.message
                : 'Something went wrong loading this coach.',
            onRetry: () => ref.invalidate(coachProvider(coachId)),
          ),
          data: (coach) => TabBarView(
            children: [
              _ProfileTab(coach: coach),
              CoachSpaceTab(providerId: coachId),
            ],
          ),
        ),
        // Anchored rather than at the bottom of a long scroll: getting in touch
        // is the point of the page, and it should not need finding.
        bottomNavigationBar:
            coach.hasValue ? _ContactBar(coach: coach.requireValue) : null,
      ),
    );
  }
}

class _ProfileTab extends ConsumerWidget {
  const _ProfileTab({required this.coach});

  final CoachProfile coach;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceProvider).value;
    final fees = formatFees(coach.feeMin, coach.feeMax, coach.feePeriod);
    final experience = formatExperience(coach.experienceYears);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Photo(coach: coach),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    coach.displayName ?? 'Unnamed',
                    style: Theme.of(context)
                        .textTheme
                        .headlineLarge
                        ?.copyWith(fontSize: 24),
                  ),
                  if (coach.categoryName != null) ...[
                    const SizedBox(height: 4),
                    Text(coach.categoryName!,
                        style: const TextStyle(color: A91.muted, fontSize: 13)),
                  ],
                  if (experience != null || fees != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      [experience, fees].whereType<String>().join('  ·  '),
                      style: const TextStyle(
                          color: A91.ink,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        if (coach.helpStatement != null &&
            coach.helpStatement!.trim().isNotEmpty) ...[
          const SizedBox(height: 20),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: A91.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: A91.borderSoft),
            ),
            child: Text(
              coach.helpStatement!.trim(),
              style:
                  const TextStyle(color: A91.ink, height: 1.55, fontSize: 14.5),
            ),
          ),
        ],
        if (coach.bio != null && coach.bio!.trim().isNotEmpty)
          _Block(
            title: 'About',
            child: Text(
              coach.bio!.trim(),
              style: const TextStyle(color: A91.muted, height: 1.6),
            ),
          ),
        if (coach.services.isNotEmpty)
          _Block(
            title: 'Teaches',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in coach.services)
                  _Chip(label: s.name, dot: A91.group(s.group)),
              ],
            ),
          ),
        if (coach.teachingPlaces.isNotEmpty && reference != null)
          _Block(
            title: 'How classes run',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in coach.teachingPlaces)
                  _Chip(label: reference.teachingPlaceLabel(p)),
              ],
            ),
          ),
        if (coach.places.isNotEmpty)
          _Block(
            title: coach.isInstitution ? 'Where they are' : 'Areas they cover',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final place in coach.places)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (place.label != null)
                          Text(
                            place.label!,
                            style: const TextStyle(
                                color: A91.ink,
                                fontSize: 14,
                                fontWeight: FontWeight.w600),
                          ),
                        Text(place.where,
                            style: const TextStyle(
                                color: A91.muted, fontSize: 13)),
                        if (place.address != null &&
                            place.address!.trim().isNotEmpty)
                          Text(
                            place.address!.trim(),
                            style: const TextStyle(
                                color: A91.faint, fontSize: 12, height: 1.45),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        if (coach.availability.isNotEmpty && reference != null)
          _Block(
            title: 'Availability',
            // Grouped by place, because a parent wants "Saturdays at their
            // centre", not seven rows to sort themselves.
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final entry in coach.availabilityByPlace.entries)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Eyebrow(reference.teachingPlaceLabel(entry.key)),
                        const SizedBox(height: 7),
                        for (final slot in entry.value)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 3),
                            child: Text(
                              '${weekDayLabels[slot.day] ?? slot.day}  '
                              '${slot.start}–${slot.end}',
                              style: const TextStyle(
                                  color: A91.muted, fontSize: 13.5),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        if (coach.feesNote != null && coach.feesNote!.trim().isNotEmpty)
          _Block(
            title: 'About the fees',
            child: Text(
              coach.feesNote!.trim(),
              style: const TextStyle(color: A91.muted, height: 1.6),
            ),
          ),
        if (coach.certifications.isNotEmpty)
          _Block(
            title: 'Credentials',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final c in coach.certifications)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 9),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.name,
                            style: const TextStyle(
                                color: A91.ink,
                                fontSize: 14,
                                fontWeight: FontWeight.w600)),
                        Text(
                          [c.issuer, c.year]
                              .where((s) => s.trim().isNotEmpty)
                              .join(' · '),
                          style:
                              const TextStyle(color: A91.faint, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Two ways to get in touch, and they are different things.
///
/// Writing opens a conversation. Asking for a call leaves a number on a
/// worklist a coach works through — the product keeps them apart because a
/// parent who wants to be rung is not waiting on a reply.
class _ContactBar extends ConsumerWidget {
  const _ContactBar({required this.coach});

  final CoachProfile coach;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: const BoxDecoration(
          color: A91.bg,
          border: Border(top: BorderSide(color: A91.border)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              Expanded(
                child: _Action(
                  label: 'Ask them to call',
                  onTap: () => showContactSheet(
                    context,
                    coach: coach,
                    kind: ContactKind.call,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Action(
                  label: 'Write to them',
                  primary: true,
                  onTap: () => showContactSheet(
                    context,
                    coach: coach,
                    kind: ContactKind.message,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

class _Action extends StatelessWidget {
  const _Action({
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          gradient: primary ? A91.ctaGradient : null,
          borderRadius: BorderRadius.circular(999),
          border: primary ? null : Border.all(color: A91.border),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: onTap,
            child: SizedBox(
              height: 48,
              child: Center(
                child: Text(
                  label,
                  style: TextStyle(
                    color: primary ? A91.onAccent : A91.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _Photo extends StatelessWidget {
  const _Photo({required this.coach});

  final CoachProfile coach;

  @override
  Widget build(BuildContext context) {
    final letter = (coach.displayName ?? '?').characters.firstOrNull ?? '?';

    return Container(
      height: 78,
      width: 78,
      decoration: BoxDecoration(
        color: A91.surface2,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: A91.border),
        image: coach.photoUrl == null
            ? null
            : DecorationImage(
                image: NetworkImage(coach.photoUrl!), fit: BoxFit.cover),
      ),
      alignment: Alignment.center,
      child: coach.photoUrl != null
          ? null
          : Text(
              letter.toUpperCase(),
              style: const TextStyle(
                  color: A91.faint, fontWeight: FontWeight.w700, fontSize: 26),
            ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            child,
          ],
        ),
      );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.dot});

  final String label;
  final Color? dot;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: A91.surface2,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: A91.borderSoft),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (dot != null) ...[
              Container(
                height: 7,
                width: 7,
                decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
              ),
              const SizedBox(width: 7),
            ],
            Text(label,
                style: const TextStyle(color: A91.muted, fontSize: 12.5)),
          ],
        ),
      );
}
