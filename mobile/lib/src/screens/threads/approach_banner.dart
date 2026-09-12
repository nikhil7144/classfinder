import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/thread.dart';
import '../../providers.dart';
import '../../theme/theme.dart';

/// A coach has written first, and the family has not answered yet.
///
/// Until they do, the coach cannot write again and the family's name and
/// number are not shared — the thread is `pending`, and that is the consent
/// gate the whole approach flow rests on. So this is a decision, not a
/// notification, and it sits above the conversation rather than inside it.
///
/// The phone is asked for in the same breath because that is the moment
/// somebody is actually deciding how reachable they want to be. Asked later,
/// on a screen of its own, it was answered by nobody.
class ApproachBanner extends ConsumerStatefulWidget {
  const ApproachBanner({super.key, required this.thread});

  final Thread thread;

  @override
  ConsumerState<ApproachBanner> createState() => _ApproachBannerState();
}

class _ApproachBannerState extends ConsumerState<ApproachBanner> {
  bool _sharePhone = false;
  bool _busy = false;
  String? _error;

  Future<void> _answer(bool accept) async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(enquiriesRepositoryProvider).respond(
            widget.thread.threadId,
            accept: accept,
            // Ignored when declining, and sent anyway rather than branched on:
            // the service is where that rule belongs.
            sharePhone: _sharePhone,
          );

      ref.invalidate(inboxProvider);
      ref.invalidate(alertsProvider);

      if (!mounted) return;
      // Declining closes the thread, so there is nothing left to look at.
      if (!accept) Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final who = widget.thread.title ?? 'A coach';

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: A91.warn.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: A91.warn.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$who wants to teach your child',
            style: const TextStyle(
                color: A91.ink, fontSize: 14.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 5),
          const Text(
            'They found your requirement and wrote first. Until you answer they '
            'cannot write again, and they cannot see your name or number.',
            style: TextStyle(color: A91.muted, fontSize: 12.5, height: 1.5),
          ),
          const SizedBox(height: 10),
          CheckboxListTile(
            value: _sharePhone,
            onChanged:
                _busy ? null : (v) => setState(() => _sharePhone = v ?? false),
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
          if (_error != null) ...[
            const SizedBox(height: 6),
            Text(_error!,
                style: const TextStyle(color: A91.danger, fontSize: 12.5)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _Button(
                  label: 'Not interested',
                  busy: _busy,
                  onTap: () => _answer(false),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Button(
                  label: 'Talk to them',
                  primary: true,
                  busy: _busy,
                  onTap: () => _answer(true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Whether a coach can see this family's number, after the fact.
///
/// Revocable on purpose. Somebody who shared a number and then thought better
/// of it can take it back, and the contact endpoints stop answering at once.
class PhoneSharingRow extends ConsumerStatefulWidget {
  const PhoneSharingRow({super.key, required this.thread});

  final Thread thread;

  @override
  ConsumerState<PhoneSharingRow> createState() => _PhoneSharingRowState();
}

class _PhoneSharingRowState extends ConsumerState<PhoneSharingRow> {
  /// What this device believes after a tap, so it lands before the round trip
  /// does. Null means nothing has been tapped and the thread's own answer
  /// stands.
  bool? _shared;
  bool _busy = false;

  Future<void> _toggle(bool next) async {
    setState(() {
      _shared = next;
      _busy = true;
    });

    try {
      await ref
          .read(enquiriesRepositoryProvider)
          .setPhoneSharing(widget.thread.threadId, next);
      ref.invalidate(inboxProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _shared = !next);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(e.message, style: const TextStyle(color: A91.ink)),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shared = _shared ?? widget.thread.showPhone ?? false;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          Icon(shared ? Icons.phone_in_talk : Icons.phone_disabled,
              size: 15, color: shared ? A91.teal : A91.faint),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              shared ? 'They can see your number' : 'Your number is not shared',
              style: TextStyle(
                  color: shared ? A91.teal : A91.faint, fontSize: 12.5),
            ),
          ),
          Opacity(
            opacity: _busy ? 0.5 : 1,
            child: GestureDetector(
              onTap: _busy ? null : () => _toggle(!shared),
              child: Text(
                shared ? 'Stop sharing' : 'Let them call me',
                style: const TextStyle(
                    color: A91.grad2,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Button extends StatelessWidget {
  const _Button({
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
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: primary ? A91.ctaGradient : null,
            borderRadius: BorderRadius.circular(999),
            border: primary ? null : Border.all(color: A91.border),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: busy ? null : onTap,
              child: SizedBox(
                height: 44,
                child: Center(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: primary ? A91.onAccent : A91.muted,
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}
