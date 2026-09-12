import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/coach.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';

/// The two ways to reach a coach, which are different things.
///
/// Writing opens a conversation. Asking for a call leaves a number on a
/// worklist the coach works through — rang them, calling back Tuesday, went
/// nowhere. The product keeps them apart because a parent waiting by a phone
/// is not waiting on a reply, and the coach's app sorts them accordingly.
enum ContactKind { message, call }

Future<void> showContactSheet(
  BuildContext context, {
  required CoachProfile coach,
  required ContactKind kind,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: A91.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (_) => _ContactSheet(coach: coach, kind: kind),
    );

class _ContactSheet extends ConsumerStatefulWidget {
  const _ContactSheet({required this.coach, required this.kind});

  final CoachProfile coach;
  final ContactKind kind;

  @override
  ConsumerState<_ContactSheet> createState() => _ContactSheetState();
}

/// The floor the web puts on a first message, and it exists because a coach is
/// judging a stranger on it.
const _minMessage = 20;

class _ContactSheetState extends ConsumerState<_ContactSheet> {
  final _message = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _details = TextEditingController();

  bool _sharePhone = false;
  bool _busy = false;
  bool _sent = false;
  String? _error;

  bool get _isCall => widget.kind == ContactKind.call;

  @override
  void initState() {
    super.initState();
    for (final c in [_message, _name, _phone, _details]) {
      c.addListener(() => setState(() {}));
    }
    // Prefilled from the profile and editable, so a second number can be used
    // without changing the account.
    final profile = ref.read(myProfileProvider).value;
    final me = ref.read(meProvider).value;
    _name.text = profile?.name ?? '';
    _phone.text = me?.phone ?? '';
  }

  @override
  void dispose() {
    for (final c in [_message, _name, _phone, _details]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _ready => _isCall
      ? _name.text.trim().isNotEmpty && _phone.text.trim().length >= 6
      : _message.text.trim().length >= _minMessage;

  Future<void> _send() async {
    if (!_ready || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    // The first thing they said they were looking for, if anything. A picker
    // here would be a taxonomy question at the worst possible moment.
    final service = ref.read(myProfileProvider).value?.lookingFor.firstOrNull;

    try {
      if (_isCall) {
        await ref.read(queriesRepositoryProvider).raise(
              providerId: widget.coach.id,
              contactName: _name.text,
              contactPhone: _phone.text,
              serviceCategoryId: service,
              details: _details.text,
            );
      } else {
        await ref.read(enquiriesRepositoryProvider).create(
              providerId: widget.coach.id,
              message: _message.text,
              serviceCategoryId: service,
              sharePhone: _sharePhone,
            );
        ref.invalidate(inboxProvider);
      }
      ref.invalidate(alertsProvider);
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.coach.displayName ?? 'this coach';

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: _sent ? _done(name) : _form(name),
      ),
    );
  }

  Widget _done(String name) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isCall ? 'Asked' : 'Sent',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            _isCall
                ? '$name has your number and will ring you. You will see it in '
                    'your requests.'
                : 'It is with $name now. Their reply will be in your messages.',
            style: const TextStyle(color: A91.muted, height: 1.55),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: 'Done',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      );

  Widget _form(String name) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isCall ? 'Ask $name to call' : 'Write to $name',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            _isCall
                ? 'They get your name and number, and ring you. Nobody else '
                    'sees either.'
                : 'One message to start. They see your name, and your number '
                    'only if you say so.',
            style:
                const TextStyle(color: A91.faint, fontSize: 12.5, height: 1.5),
          ),
          const SizedBox(height: 18),
          if (_isCall) ...[
            TextField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration:
                  const InputDecoration(hintText: 'Your name', isDense: true),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration:
                  const InputDecoration(hintText: 'Your number', isDense: true),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _details,
              minLines: 3,
              maxLines: 5,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Anything they should know before ringing — optional',
                counterText: '',
                isDense: true,
              ),
            ),
          ] else ...[
            TextField(
              controller: _message,
              minLines: 4,
              maxLines: 7,
              maxLength: 4000,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'My son is 9 and has never played before. Do you '
                    'take beginners?',
                counterText: '',
                isDense: true,
                helperText: _message.text.trim().length < _minMessage
                    ? 'At least $_minMessage characters — they are deciding on this.'
                    : null,
                helperStyle: const TextStyle(color: A91.faint, fontSize: 12),
              ),
            ),
            const SizedBox(height: 10),
            // Opt in, never a default, and per conversation — sharing a number
            // with one coach is not sharing it with every coach who writes.
            CheckboxListTile(
              value: _sharePhone,
              onChanged: (v) => setState(() => _sharePhone = v ?? false),
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: A91.grad1,
              title: const Text(
                'Let them see my number',
                style: TextStyle(color: A91.muted, fontSize: 13),
              ),
              subtitle: const Text(
                'Just this coach, and you can take it back later.',
                style: TextStyle(color: A91.faint, fontSize: 11.5),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: const TextStyle(color: A91.danger, fontSize: 13)),
          ],
          const SizedBox(height: 16),
          PrimaryButton(
            label: _isCall ? 'Ask them to call' : 'Send',
            busy: _busy,
            onPressed: _ready && !_busy ? _send : null,
          ),
        ],
      );
}
