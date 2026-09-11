import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/api_exception.dart';
import '../../data/models/query.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';

/// One lead, and everything a coach can do with it.
///
/// The number does not hide behind a tap-to-reveal. It is the point of a
/// query, and on a phone it is also the action — tapping it opens the dialler
/// with the number already in it.
class QueryCard extends ConsumerStatefulWidget {
  const QueryCard({super.key, required this.query});

  final Query query;

  @override
  ConsumerState<QueryCard> createState() => _QueryCardState();
}

class _QueryCardState extends ConsumerState<QueryCard> {
  bool _busy = false;
  String? _error;
  bool _writing = false;
  final _reply = TextEditingController();

  Query get _q => widget.query;

  @override
  void initState() {
    super.initState();
    _reply.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _move(QueryStatus status, {DateTime? callbackAt}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(queriesRepositoryProvider)
          .setStatus(_q.id, status, callbackAt: callbackAt);
      ref.invalidate(queriesProvider);
      // Moving a lead off 'new' is one of the two ways the badge clears.
      ref.invalidate(alertsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _call() async {
    // Strip everything the dialler does not want. Numbers arrive as
    // "+91 98765 43210" and "098765-43210" alike, and tel: takes neither the
    // spaces nor the dashes.
    final digits = _q.contactPhone.replaceAll(RegExp(r'[^\d+]'), '');
    final uri = Uri(scheme: 'tel', path: digits);

    if (!await launchUrl(uri) && mounted) {
      setState(() => _error = 'This device cannot place calls.');
    }
  }

  Future<void> _schedule() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _q.callbackAt ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _q.callbackAt ?? DateTime.now().add(const Duration(hours: 1)),
      ),
    );
    if (time == null) return;

    await _move(
      QueryStatus.callbackScheduled,
      callbackAt:
          DateTime(date.year, date.month, date.day, time.hour, time.minute),
    );
  }

  Future<void> _send() async {
    final body = _reply.text.trim();
    if (body.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(queriesRepositoryProvider).answer(_q.id, body);
      _reply.clear();
      // Writing to somebody is contact: the service moves a 'new' lead along
      // in the same call, so both lists have changed.
      ref.invalidate(queriesProvider);
      ref.invalidate(inboxProvider);
      ref.invalidate(alertsProvider);

      if (!mounted) return;
      setState(() => _writing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: A91.surface3,
          content: Text('Sent. It is in your messages.',
              style: TextStyle(color: A91.ink)),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _close() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: A91.surface,
        title: const Text('Close this request?'),
        content: Text(
          'Close ${_q.contactName}’s request without taking it on? They '
          'will not be told, and it moves to Finished.',
          style: const TextStyle(color: A91.muted, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep it', style: TextStyle(color: A91.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Close it',
                style:
                    TextStyle(color: A91.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (sure == true) await _move(QueryStatus.closed);
  }

  @override
  Widget build(BuildContext context) {
    final open = _q.status.isOpen;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _q.unread ? A91.grad1 : A91.border),
      ),
      child: Column(
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
                      _q.contactName,
                      style: const TextStyle(
                        color: A91.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        if (_q.serviceName != null) _q.serviceName!,
                        _onDate(_q.createdAt),
                      ].join(' · '),
                      style: const TextStyle(color: A91.faint, fontSize: 12),
                    ),
                  ],
                ),
              ),
              _StatusChip(status: _q.status),
            ],
          ),
          if (_q.details != null && _q.details!.trim().isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              _q.details!.trim(),
              style: const TextStyle(
                  color: A91.muted, fontSize: 13.5, height: 1.55),
            ),
          ],
          const SizedBox(height: 16),
          _CallButton(phone: _q.contactPhone, onTap: _call),
          if (_q.callbackAt != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.event_outlined, size: 15, color: A91.warn),
                const SizedBox(width: 7),
                Text(
                  'Call booked — ${_when(_q.callbackAt!)}',
                  style: const TextStyle(
                      color: A91.warn,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: A91.danger, fontSize: 12.5)),
          ],
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (_q.status == QueryStatus.isNew)
                _Action(
                  label: 'Mark contacted',
                  busy: _busy,
                  onTap: () => _move(QueryStatus.contacted),
                ),
              if (open) ...[
                _Action(
                  label: _q.callbackAt == null
                      ? 'Schedule a call'
                      : 'Change call time',
                  busy: _busy,
                  onTap: _schedule,
                ),
                _Action(
                  label: 'Message',
                  busy: _busy,
                  onTap: () => setState(() => _writing = !_writing),
                ),
                _Action(
                  label: 'Completed',
                  busy: _busy,
                  primary: true,
                  onTap: () => _move(QueryStatus.completed),
                ),
                _Action(label: 'Close', busy: _busy, onTap: _close),
              ] else
                // Finished is not a one-way door. The web learned that:
                // Completed and Close were a click each with no way back.
                _Action(
                  label: 'Reopen',
                  busy: _busy,
                  onTap: () => _move(QueryStatus.contacted),
                ),
            ],
          ),
          if (_writing) ...[
            const SizedBox(height: 14),
            TextField(
              controller: _reply,
              minLines: 3,
              maxLines: 6,
              maxLength: 4000,
              enabled: !_busy,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText:
                    'Hi ${_q.contactName.split(' ').first} — happy to help.',
                counterText: '',
                isDense: true,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'They will see this came from their request, so it will not '
              'arrive out of the blue.',
              style: TextStyle(color: A91.faint, fontSize: 11.5, height: 1.45),
            ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: 'Send',
              busy: _busy,
              onPressed: _reply.text.trim().isEmpty || _busy ? null : _send,
            ),
          ],
        ],
      ),
    );
  }

  /// "3 Sep 2026" — 9/3/2026 reads two ways, and this product is used in India.
  static String _onDate(DateTime at) {
    const months = [
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
    return '${at.day} ${months[at.month - 1]} ${at.year}';
  }

  /// A booked call is about when, not what date.
  static String _when(DateTime at) {
    final days = at.difference(DateTime.now()).inHours / 24;
    final time = TimeOfDay.fromDateTime(at);
    final clock = '${time.hour.toString().padLeft(2, '0')}:'
        '${time.minute.toString().padLeft(2, '0')}';

    if (days >= 0 && days < 1) return 'today, $clock';
    if (days >= 1 && days < 2) return 'tomorrow, $clock';
    if (days < 0 && days > -1) return 'yesterday, $clock';
    return '${_onDate(at)}, $clock';
  }
}

/// The number, and the dialler behind it.
class _CallButton extends StatelessWidget {
  const _CallButton({required this.phone, required this.onTap});

  final String phone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: A91.surface2,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: A91.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.call, size: 18, color: A91.grad2),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    phone,
                    style: const TextStyle(
                      color: A91.ink,
                      fontSize: 15.5,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
                const Text('Call',
                    style: TextStyle(
                        color: A91.grad2,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final QueryStatus status;

  Color get _tone => switch (status) {
        QueryStatus.isNew => A91.warn,
        QueryStatus.completed => A91.teal,
        _ => A91.faint,
      };

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: _tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: _tone.withValues(alpha: 0.34)),
        ),
        child: Text(
          status.label,
          style: TextStyle(
              color: _tone, fontSize: 11, fontWeight: FontWeight.w700),
        ),
      );
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

  /// Filled rather than outlined. One per card at most — the gradient stays
  /// with PrimaryButton, so this is a weight, not a colour.
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
