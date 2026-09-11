import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/demand.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';

/// One requirement in full, and the one message a coach gets to send.
///
/// The composer is on this screen rather than behind a dialog because what a
/// coach should be reading while they write it is the requirement itself — the
/// whole argument for this product is that the first message can be about
/// their child rather than a request for details already given.
class DemandDetailScreen extends ConsumerStatefulWidget {
  const DemandDetailScreen({super.key, required this.demand});

  final Demand demand;

  @override
  ConsumerState<DemandDetailScreen> createState() => _DemandDetailScreenState();
}

/// The floor the database sets on a group request, and the web sets on both.
const _minMessage = 20;

class _DemandDetailScreenState extends ConsumerState<DemandDetailScreen> {
  final _message = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _sent = false;

  @override
  void initState() {
    super.initState();
    _message.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Demand get _d => widget.demand;

  Future<void> _send() async {
    final me = ref.read(meProvider).value;
    final providerId = me?.provider?.id;
    if (providerId == null) {
      setState(
          () => _error = 'Finish your listing before writing to families.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(studentsRepositoryProvider).approach(
            kind: _d.kind,
            targetId: _d.id,
            providerId: providerId,
            message: _message.text.trim(),
            // The web sends the first service on the requirement. A picker
            // would be a taxonomy question at the worst possible moment, and
            // the field is optional precisely because of that.
            serviceCategoryId: _d.serviceCategoryIds.isEmpty
                ? null
                : _d.serviceCategoryIds.first,
          );

      // The row moves below the untouched ones and grows a status, so the
      // feed has to be re-read rather than patched in place.
      ref.invalidate(demandFeedProvider);
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSend = _message.text.trim().length >= _minMessage && !_busy;

    return Scaffold(
      appBar: AppBar(title: const Text('The requirement')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Text(
              _d.serviceNames.isEmpty
                  ? 'A family nearby'
                  : _d.serviceNames.join(', '),
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 25),
            ),
            const SizedBox(height: 6),
            Text(
              _d.isGroup
                  ? '${_d.memberCount} families, together'
                  : 'One family',
              style: const TextStyle(color: A91.muted),
            ),
            const SizedBox(height: 22),
            _Facts(demand: _d),
            if (_d.notes != null && _d.notes!.trim().isNotEmpty) ...[
              const SizedBox(height: 22),
              const Eyebrow('In their words'),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: A91.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: A91.borderSoft),
                ),
                child: Text(
                  _d.notes!.trim(),
                  style: const TextStyle(color: A91.muted, height: 1.6),
                ),
              ),
            ],
            const SizedBox(height: 28),
            if (_sent)
              const _Sent()
            else if (_d.alreadyApproached)
              const _AlreadyWritten()
            else
              _Composer(
                controller: _message,
                busy: _busy,
                error: _error,
                canSend: canSend,
                onSend: _send,
                isGroup: _d.isGroup,
              ),
          ],
        ),
      ),
    );
  }
}

/// What they said they wanted, as a list rather than prose.
class _Facts extends StatelessWidget {
  const _Facts({required this.demand});

  final Demand demand;

  static const _dayLabels = {
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
    'sun': 'Sunday',
  };

  static const _modeLabels = {
    'own_centre': 'At your centre',
    'student_home': 'At their home',
    'online': 'Online',
  };

  @override
  Widget build(BuildContext context) {
    final rows = <(String, String)>[
      if (demand.areaName != null)
        (
          'Where',
          [
            demand.areaName!,
            if (demand.cityName != null) demand.cityName!,
            if (demand.distanceKm != null)
              demand.distanceKm! < 1
                  ? '${(demand.distanceKm! * 1000).round()} m away'
                  : '${demand.distanceKm!.toStringAsFixed(1)} km away',
          ].join(' · ')
        ),
      if (demand.learnerAge != null) ('Age', '${demand.learnerAge}'),
      if (demand.level != null && demand.level!.isNotEmpty)
        ('Level', demand.level!),
      if (demand.studentCount > 1) ('Children', '${demand.studentCount}'),
      if (demand.preferredModes.isNotEmpty)
        (
          'Where they want it',
          demand.preferredModes.map((m) => _modeLabels[m] ?? m).join(', ')
        ),
      if (demand.preferredDays.isNotEmpty)
        (
          'Days',
          demand.preferredDays.map((d) => _dayLabels[d] ?? d).join(', ')
        ),
      if (demand.preferredTime != null) ('Time', demand.preferredTime!),
    ];

    return Column(
      children: [
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 118,
                  child: Text(
                    label,
                    style: const TextStyle(color: A91.faint, fontSize: 13),
                  ),
                ),
                Expanded(
                  child: Text(
                    value,
                    style: const TextStyle(
                        color: A91.ink, height: 1.45, fontSize: 14),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.busy,
    required this.error,
    required this.canSend,
    required this.onSend,
    required this.isGroup,
  });

  final TextEditingController controller;
  final bool busy;
  final String? error;
  final bool canSend;
  final VoidCallback onSend;
  final bool isGroup;

  @override
  Widget build(BuildContext context) {
    final short = controller.text.trim().length < _minMessage;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Eyebrow('Write to them'),
        const SizedBox(height: 10),
        Text(
          isGroup
              ? 'One message, and every family in the group sees it. They decide '
                  'together whether to answer.'
              : 'One message. They decide whether to answer — until they do, you '
                  'cannot write again, and you will not see their name or number.',
          style:
              const TextStyle(color: A91.muted, height: 1.55, fontSize: 13.5),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: controller,
          maxLines: 6,
          minLines: 4,
          maxLength: 1000,
          enabled: !busy,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            hintText: 'What you teach, where, and why you suit them.',
            // The counter already says how long it is; this says how long it
            // has to be, which is the part somebody is stuck on.
            helperText: short
                ? 'At least $_minMessage characters — they are judging a stranger on this.'
                : null,
            helperStyle: const TextStyle(color: A91.faint, fontSize: 12),
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 6),
          Text(
            error!,
            style:
                const TextStyle(color: A91.danger, fontWeight: FontWeight.w500),
          ),
        ],
        const SizedBox(height: 14),
        PrimaryButton(
          label: 'Send',
          busy: busy,
          onPressed: canSend ? onSend : null,
        ),
      ],
    );
  }
}

class _Sent extends StatelessWidget {
  const _Sent();

  @override
  Widget build(BuildContext context) => const _Notice(
        tone: A91.teal,
        title: 'Sent',
        body: 'It is with them now. You will see their reply in your messages, '
            'and you can write again once they answer.',
      );
}

class _AlreadyWritten extends StatelessWidget {
  const _AlreadyWritten();

  @override
  Widget build(BuildContext context) => const _Notice(
        tone: A91.faint,
        title: 'You have already written',
        body: 'One message each until they answer. Their reply will appear in '
            'your messages.',
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.title, required this.body});

  final Color tone;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: tone.withValues(alpha: 0.32)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                  color: tone, fontWeight: FontWeight.w700, fontSize: 15),
            ),
            const SizedBox(height: 6),
            Text(body,
                style: const TextStyle(
                    color: A91.muted, height: 1.55, fontSize: 13.5)),
          ],
        ),
      );
}
