import 'package:flutter/material.dart';

import '../../data/models/demand.dart';
import '../../theme/theme.dart';

/// One family, or one group of them, as a card.
///
/// What a coach needs in order to decide whether to write: what they want,
/// how far away, for whom, when, and for how much. Everything else waits for
/// the detail screen.
class DemandCard extends StatelessWidget {
  const DemandCard({super.key, required this.demand, this.onTap});

  final Demand demand;
  final VoidCallback? onTap;

  static const _dayLabels = {
    'mon': 'Mon',
    'tue': 'Tue',
    'wed': 'Wed',
    'thu': 'Thu',
    'fri': 'Fri',
    'sat': 'Sat',
    'sun': 'Sun',
  };

  static const _periodLabels = {
    'per_hour': '/hr',
    'per_session': '/session',
    'per_month': '/month',
    'per_course': '/course',
  };

  /// "₹1,500–2,500/month", or null when they did not say.
  String? get _budget {
    final min = demand.budgetMin;
    final max = demand.budgetMax;
    if (min == null && max == null) return null;

    String money(int n) {
      // Indian grouping: 1,50,000 rather than 150,000.
      final s = n.toString();
      if (s.length <= 3) return '₹$s';
      final last3 = s.substring(s.length - 3);
      var rest = s.substring(0, s.length - 3);
      final parts = <String>[];
      while (rest.length > 2) {
        parts.insert(0, rest.substring(rest.length - 2));
        rest = rest.substring(0, rest.length - 2);
      }
      if (rest.isNotEmpty) parts.insert(0, rest);
      return '₹${parts.join(',')},$last3';
    }

    final suffix = _periodLabels[demand.budgetPeriod] ?? '';
    if (min != null && max != null && min != max) {
      return '${money(min)}–${money(max)}$suffix';
    }
    return '${money(min ?? max!)}$suffix';
  }

  /// "1.2 km" / "850 m" — close distances read better in metres.
  String? get _distance {
    final km = demand.distanceKm;
    if (km == null) return null;
    if (km < 1) return '${(km * 1000).round()} m';
    return '${km.toStringAsFixed(1)} km';
  }

  String get _who {
    final bits = <String>[];
    if (demand.learnerAge != null) bits.add('Age ${demand.learnerAge}');
    if (demand.level != null && demand.level!.isNotEmpty) {
      bits.add(demand.level!);
    }
    if (demand.studentCount > 1) bits.add('${demand.studentCount} children');
    return bits.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final days = demand.preferredDays.map((d) => _dayLabels[d] ?? d).join(', ');
    final budget = _budget;
    final distance = _distance;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      demand.serviceNames.isEmpty
                          ? 'A family nearby'
                          : demand.serviceNames.join(', '),
                      style: const TextStyle(
                        color: A91.ink,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  if (demand.isGroup) ...[
                    const SizedBox(width: 10),
                    _Badge(
                      // The number is the point of a group: one reply reaches
                      // all of them, and that is what makes it worth answering
                      // before a single parent.
                      label: '${demand.memberCount} families',
                      tone: A91.teal,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              _Line(
                icon: Icons.place_outlined,
                text: [
                  if (demand.areaName != null) demand.areaName!,
                  if (distance != null) distance,
                ].join(' · '),
              ),
              if (_who.isNotEmpty)
                _Line(icon: Icons.person_outline, text: _who),
              if (days.isNotEmpty || demand.preferredTime != null)
                _Line(
                  icon: Icons.schedule_outlined,
                  text: [
                    if (days.isNotEmpty) days,
                    if (demand.preferredTime != null) demand.preferredTime!,
                  ].join(' · '),
                ),
              if (budget != null)
                _Line(icon: Icons.payments_outlined, text: budget),
              if (demand.notes != null && demand.notes!.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  demand.notes!.trim(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: A91.muted, height: 1.5, fontSize: 13.5),
                ),
              ],
              if (demand.alreadyApproached) ...[
                const SizedBox(height: 12),
                // Not an error and not a failure — just already done. The feed
                // sorts these below the untouched ones, and saying so stops a
                // coach wondering why the button is gone.
                const _Badge(label: 'You have written', tone: A91.faint),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Icon(icon, size: 15, color: A91.faint),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: A91.muted, fontSize: 13.5),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.tone});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tone.withValues(alpha: 0.35)),
        ),
        child: Text(
          label,
          style: TextStyle(
              color: tone, fontSize: 11.5, fontWeight: FontWeight.w600),
        ),
      );
}
