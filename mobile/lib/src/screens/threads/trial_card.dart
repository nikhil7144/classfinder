import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/thread.dart';
import '../../data/models/trial.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';

/// Arranging a first class, inside the conversation about it.
///
/// Pinned above the messages rather than sent as one, because it is a state
/// both people act on — suggested, confirmed, been and gone — and a message
/// scrolls away. The web keeps it in the same place for the same reason.
///
/// Both sides can suggest. Only the other side can answer, and afterwards each
/// records what happened separately: a coach marking a no-show does not put
/// that on the family's record.
class TrialCard extends ConsumerStatefulWidget {
  const TrialCard({super.key, required this.thread});

  final Thread thread;

  @override
  ConsumerState<TrialCard> createState() => _TrialCardState();
}

class _TrialCardState extends ConsumerState<TrialCard> {
  bool _busy = false;
  String? _error;

  ThreadKey get _key => ThreadKey(widget.thread.kind, widget.thread.threadId);

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      ref.invalidate(trialsProvider(_key));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _propose() async {
    final when = await _pickMoment();
    if (when == null) return;

    await _run(() => ref.read(trialsRepositoryProvider).propose(
          kind: widget.thread.kind,
          threadId: widget.thread.threadId,
          scheduledAt: when,
        ));
  }

  Future<DateTime?> _pickMoment() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 2)),
      // No point offering yesterday for a class nobody has had yet.
      firstDate: now,
      lastDate: now.add(const Duration(days: 180)),
    );
    if (date == null || !mounted) return null;

    final time = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 17, minute: 0),
    );
    if (time == null) return null;

    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _recordOutcome() async {
    final picked = await showModalBottomSheet<TrialOutcome>(
      context: context,
      backgroundColor: A91.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('How did it go?',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 6),
                  const Text(
                    'Only you see your answer. The other side records theirs '
                    'separately.',
                    style: TextStyle(
                        color: A91.faint, fontSize: 12.5, height: 1.5),
                  ),
                ],
              ),
            ),
            for (final outcome in TrialOutcome.values)
              ListTile(
                title:
                    Text(outcome.label, style: const TextStyle(color: A91.ink)),
                onTap: () => Navigator.pop(context, outcome),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (picked == null) return;
    await _run(() => ref.read(trialsRepositoryProvider).setOutcome(
          id: _latest!.id,
          kind: widget.thread.kind,
          threadId: widget.thread.threadId,
          outcome: picked,
        ));
  }

  Trial? _latest;

  @override
  Widget build(BuildContext context) {
    final trials = ref.watch(trialsProvider(_key));

    // A thread with no trial yet still shows the row, because suggesting one
    // is the point of the conversation. A failure hides it: an error about
    // trials should not sit on top of a conversation that is working.
    final list = trials.value ?? const <Trial>[];
    _latest = list.isEmpty
        ? null
        : (list.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt)))
            .first;

    if (trials.hasError) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: A91.borderSoft),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('First class'),
          const SizedBox(height: 10),
          if (_latest == null) _none() else _one(_latest!),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: const TextStyle(color: A91.danger, fontSize: 12.5)),
          ],
        ],
      ),
    );
  }

  Widget _none() => Row(
        children: [
          const Expanded(
            child: Text(
              'Not arranged yet.',
              style: TextStyle(color: A91.muted, fontSize: 13.5),
            ),
          ),
          _Action(label: 'Suggest a time', busy: _busy, onTap: _propose),
        ],
      );

  Widget _one(Trial trial) {
    final when = _moment(trial.scheduledAt);
    final where = trial.placeLabel;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    when,
                    style: const TextStyle(
                      color: A91.ink,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      '${trial.durationMinutes} min',
                      if (where != null) where,
                      if (trial.studentCount != null)
                        '${trial.studentCount} coming',
                    ].join(' · '),
                    style: const TextStyle(color: A91.faint, fontSize: 12),
                  ),
                ],
              ),
            ),
            _StatusChip(trial: trial),
          ],
        ),
        if (trial.placeNote != null && trial.placeNote!.trim().isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            trial.placeNote!.trim(),
            style:
                const TextStyle(color: A91.muted, fontSize: 12.5, height: 1.45),
          ),
        ],
        const SizedBox(height: 12),
        ..._actionsFor(trial),
      ],
    );
  }

  List<Widget> _actionsFor(Trial trial) {
    // Waiting on them: nothing to do but say so, and offer another time.
    if (trial.awaitingTheirAnswer) {
      return [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Waiting for them to confirm.',
                style: TextStyle(color: A91.warn, fontSize: 12.5),
              ),
            ),
            _Action(label: 'Suggest another', busy: _busy, onTap: _propose),
          ],
        ),
      ];
    }

    if (trial.awaitingMyAnswer) {
      return [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _Action(
              label: 'That works',
              primary: true,
              busy: _busy,
              onTap: () => _run(
                () => ref.read(trialsRepositoryProvider).respond(
                      id: trial.id,
                      kind: widget.thread.kind,
                      threadId: widget.thread.threadId,
                      confirm: true,
                    ),
              ),
            ),
            _Action(
              label: 'Not that time',
              busy: _busy,
              onTap: () => _run(
                () => ref.read(trialsRepositoryProvider).respond(
                      id: trial.id,
                      kind: widget.thread.kind,
                      threadId: widget.thread.threadId,
                      confirm: false,
                    ),
              ),
            ),
          ],
        ),
      ];
    }

    if (trial.needsOutcome) {
      return [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Did it happen?',
                style: TextStyle(color: A91.muted, fontSize: 12.5),
              ),
            ),
            _Action(
                label: 'Say how it went', busy: _busy, onTap: _recordOutcome),
          ],
        ),
      ];
    }

    if (trial.myOutcome != null) {
      return [
        Text(
          'You said: ${trial.myOutcome!.label.toLowerCase()}.',
          style: const TextStyle(color: A91.faint, fontSize: 12.5),
        ),
      ];
    }

    // Declined, or confirmed and still ahead. Either way another time can be
    // put forward.
    return [
      Align(
        alignment: Alignment.centerLeft,
        child: _Action(
            label: 'Suggest another time', busy: _busy, onTap: _propose),
      ),
    ];
  }

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  /// "Sat 20 Sep, 17:00".
  static String _moment(DateTime at) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final time = TimeOfDay.fromDateTime(at);
    return '${days[at.weekday - 1]} ${at.day} ${_months[at.month - 1]}, '
        '${time.hour.toString().padLeft(2, '0')}:'
        '${time.minute.toString().padLeft(2, '0')}';
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.trial});

  final Trial trial;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = switch (trial.status) {
      TrialStatus.confirmed => (
          trial.isPast ? 'Been and gone' : 'Confirmed',
          trial.isPast ? A91.faint : A91.teal
        ),
      TrialStatus.declined => ('Declined', A91.faint),
      TrialStatus.proposed => ('Suggested', A91.warn),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.32)),
      ),
      child: Text(
        label,
        style:
            TextStyle(color: tone, fontSize: 10.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.label,
    required this.onTap,
    required this.busy,
    this.primary = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool busy;
  final bool primary;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: busy ? 0.5 : 1,
        child: Material(
          color: primary ? A91.surface3 : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: busy ? null : onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: primary ? A91.grad1 : A91.border),
              ),
              child: Text(
                label,
                style: TextStyle(
                  color: primary ? A91.ink : A91.muted,
                  fontSize: 12.5,
                  fontWeight: primary ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      );
}
