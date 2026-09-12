import 'package:flutter/material.dart';

import '../../data/models/coach.dart';
import '../../data/models/reference.dart';
import '../../theme/theme.dart';

/// One coach in a list of results.
///
/// Every one of the eighteen columns search returns is on this card, and that
/// is deliberate: a first pass at the search DTO dropped five of them, and the
/// five it dropped — help statement, experience, the fee range and the
/// teaching places — were exactly what a parent scans for.
class CoachCard extends StatelessWidget {
  const CoachCard({
    super.key,
    required this.coach,
    required this.reference,
    required this.onTap,
    this.showDistance = true,
  });

  final CoachResult coach;
  final Reference reference;
  final VoidCallback onTap;

  /// Off when the search had nothing to measure from — a distance from an
  /// area's centroid is fine, a distance from nowhere is a made-up number.
  final bool showDistance;

  @override
  Widget build(BuildContext context) {
    final fees = formatFees(coach.feeMin, coach.feeMax, coach.feePeriod);
    final distance = showDistance ? formatDistance(coach.distanceKm) : null;
    final experience = formatExperience(coach.experienceYears);

    // Four is what fits before the row wraps into a paragraph.
    final services = coach.serviceCategoryIds.take(4).toList();
    final more = coach.serviceCategoryIds.length - services.length;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Avatar(coach: coach),
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
                                style: const TextStyle(
                                  color: A91.ink,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            // Paid placement, labelled rather than hidden.
                            if (coach.isFeatured) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 7, vertical: 3),
                                decoration: BoxDecoration(
                                  color: A91.warn.withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text(
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
                        if (coach.nearestAreaName != null) ...[
                          const SizedBox(height: 3),
                          Text(
                            coach.nearestAreaName!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: A91.muted, fontSize: 12.5),
                          ),
                        ],
                        if (distance != null || experience != null) ...[
                          const SizedBox(height: 3),
                          Text(
                            [distance, experience]
                                .whereType<String>()
                                .join('  ·  '),
                            style: const TextStyle(
                                color: A91.faint, fontSize: 11.5),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (fees != null) ...[
                    const SizedBox(width: 10),
                    Text(
                      fees,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: A91.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
              if (coach.helpStatement != null &&
                  coach.helpStatement!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  coach.helpStatement!.trim(),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: A91.muted, fontSize: 13.5, height: 1.5),
                ),
              ],
              if (services.isNotEmpty || coach.teachingPlaces.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final id in services)
                      _Tag(
                        label: reference.serviceName(id),
                        dot: A91.group(reference.service(id)?.group),
                      ),
                    if (more > 0) _Tag(label: '+$more more'),
                    for (final id in coach.teachingPlaces)
                      _Tag(
                          label: reference.teachingPlaceLabel(id), faint: true),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.coach});

  final CoachResult coach;

  @override
  Widget build(BuildContext context) {
    final letter = (coach.displayName ?? '?').characters.firstOrNull ?? '?';

    return Container(
      height: 52,
      width: 52,
      decoration: BoxDecoration(
        color: A91.surface2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: A91.border),
        image: coach.photoUrl == null
            ? null
            : DecorationImage(
                image: NetworkImage(coach.photoUrl!),
                fit: BoxFit.cover,
              ),
      ),
      alignment: Alignment.center,
      child: coach.photoUrl != null
          ? null
          : Text(
              letter.toUpperCase(),
              style: const TextStyle(
                color: A91.faint,
                fontWeight: FontWeight.w700,
                fontSize: 19,
              ),
            ),
    );
  }
}

/// A taxonomy tag. The colour is a dot, never a fill — globals.css gives those
/// colours one job and it is not looking like a button.
class _Tag extends StatelessWidget {
  const _Tag({required this.label, this.dot, this.faint = false});

  final String label;
  final Color? dot;
  final bool faint;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
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
                height: 6,
                width: 6,
                decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                color: faint ? A91.faint : A91.muted,
                fontSize: 11.5,
              ),
            ),
          ],
        ),
      );
}
