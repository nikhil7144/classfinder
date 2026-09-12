import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../data/api_exception.dart';
import '../../data/models/group.dart';
import '../../data/models/thread.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import '../threads/thread_screen.dart';

/// One group — /groups/[id].
///
/// Two things on one screen, because they are two halves of the same job: what
/// the group is and how long it has, and the coaches who have pitched to it.
/// Splitting them into tabs would hide the pitches, which are the only reason
/// anybody opens this twice.
class GroupScreen extends ConsumerStatefulWidget {
  const GroupScreen({super.key, required this.group});

  final Group group;

  @override
  ConsumerState<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends ConsumerState<GroupScreen> {
  bool _busy = false;
  String? _error;

  /// The group as last read back, so the screen updates without a pop.
  Group? _current;

  Group get _g => _current ?? widget.group;

  Future<void> _run(Future<Group?> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await action();
      ref.invalidate(myGroupsProvider);
      if (mounted && updated != null) setState(() => _current = updated);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    // The web copies a link; a phone shares it, which is what somebody in a
    // building WhatsApp group is actually going to do with it.
    await Share.share(
      'We are getting a group together for ${_g.serviceName ?? 'classes'} '
      'in ${_g.societyName ?? 'our building'}. '
      'Join us: https://www.aspire91.com/groups/${_g.id}',
      subject: 'Join our Aspire91 group',
    );
  }

  Future<void> _leave() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: A91.surface,
        title: const Text('Leave this group?'),
        content: const Text(
          'You stop seeing the coaches who pitch to it. The group carries on '
          'without you.',
          style: TextStyle(color: A91.muted, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Stay', style: TextStyle(color: A91.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Leave',
                style:
                    TextStyle(color: A91.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (sure != true) return;

    await _run(() async {
      await ref.read(groupsRepositoryProvider).leave(_g.id);
      return null;
    });
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final pitches = ref.watch(groupPitchesProvider(_g.id));

    return Scaffold(
      appBar: AppBar(
        title: Text(_g.serviceName ?? 'Group'),
        actions: [
          IconButton(
            onPressed: _share,
            icon: const Icon(Icons.ios_share, size: 20),
            tooltip: 'Send the link',
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(groupPitchesProvider(_g.id));
            ref.invalidate(myGroupsProvider);
            await ref.read(groupPitchesProvider(_g.id).future);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
            children: [
              _overview(),
              if (_error != null) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 12, left: 4),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: A91.danger, fontSize: 13),
                  ),
                ),
              ],
              const SizedBox(height: 26),
              Text('Coaches who pitched',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              ...pitches.when(
                loading: () => [const ListSkeleton(rows: 2)],
                error: (error, _) => [
                  ErrorState(
                    message: error is ApiException
                        ? error.message
                        : 'Something went wrong loading the pitches.',
                    onRetry: () => ref.invalidate(groupPitchesProvider(_g.id)),
                  ),
                ],
                data: (pitches) => pitches.isEmpty
                    ? [_noPitches()]
                    : [
                        for (final pitch in pitches)
                          _PitchCard(
                            pitch: pitch,
                            group: _g,
                            onChanged: () =>
                                ref.invalidate(groupPitchesProvider(_g.id)),
                          ),
                      ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _overview() {
    final dormant = _g.dormantReason;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('Your group'),
          const SizedBox(height: 10),
          Text(
            [
              if (_g.societyName != null) _g.societyName!,
              if (_g.areaName != null) _g.areaName!,
            ].join(' · '),
            style: const TextStyle(
                color: A91.ink, fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            '${_g.memberCount} ${_g.memberCount == 1 ? 'family' : 'families'} '
            'so far, asking for ${_g.studentCount} '
            '${_g.studentCount == 1 ? 'place' : 'places'}',
            style: const TextStyle(color: A91.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          // Why coaches cannot see it, when they cannot. A group that is
          // quietly invisible is the worst of the states to be in.
          if (dormant != null)
            _Notice(
              tone: A91.warn,
              text: _g.isActive
                  ? '$dormant. Coaches are not seeing it.'
                  : '$dormant — a group needs at least $groupMinStudents '
                      'families before coaches see it. Send the link to a '
                      'neighbour.',
            )
          else
            _Notice(
              tone: A91.teal,
              text: 'Coaches in ${_g.areaName ?? 'your area'} can see it. '
                  '${_g.remaining}.',
            ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Action(label: 'Send the link', busy: _busy, onTap: _share),
              if (_g.isCreator) ...[
                _Action(
                  label: 'Give it longer',
                  busy: _busy,
                  onTap: () => _run(() => ref
                      .read(groupsRepositoryProvider)
                      .update(_g.id, extend: true)),
                ),
                if (_g.isClosed)
                  _Action(
                    label: 'Reopen it',
                    busy: _busy,
                    onTap: () => _run(() => ref
                        .read(groupsRepositoryProvider)
                        .update(_g.id, closed: false)),
                  )
                else
                  _Action(
                    label: 'Close it',
                    busy: _busy,
                    onTap: () => _run(() => ref
                        .read(groupsRepositoryProvider)
                        .update(_g.id, closed: true)),
                  ),
              ] else
                _Action(label: 'Leave', busy: _busy, onTap: _leave),
            ],
          ),
        ],
      ),
    );
  }

  Widget _noPitches() => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: A91.borderSoft),
        ),
        child: Text(
          _g.isActive
              ? 'Nobody has pitched yet. Coaches in the area can see this '
                  'group and will write when they can take it.'
              : 'Coaches cannot see this group at the moment, so nobody can '
                  'pitch to it.',
          style: const TextStyle(color: A91.muted, fontSize: 13, height: 1.55),
        ),
      );
}

/// One coach's pitch, and the decision on it.
class _PitchCard extends ConsumerStatefulWidget {
  const _PitchCard({
    required this.pitch,
    required this.group,
    required this.onChanged,
  });

  final GroupPitch pitch;
  final Group group;
  final VoidCallback onChanged;

  @override
  ConsumerState<_PitchCard> createState() => _PitchCardState();
}

class _PitchCardState extends ConsumerState<_PitchCard> {
  bool _busy = false;

  Future<void> _answer(bool accept) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(groupsRepositoryProvider)
          .respondToPitch(widget.pitch.requestId, accept: accept);
      widget.onChanged();
      ref.invalidate(myGroupsProvider);
      ref.invalidate(alertsProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
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

  /// The conversation this pitch opened. Group messages key on the request,
  /// not the group — one coach, one thread.
  void _openThread() {
    final pitch = widget.pitch;
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => ThreadScreen(
              thread: Thread(
                kind: 'group',
                threadId: pitch.requestId,
                groupId: widget.group.id,
                providerId: pitch.providerId,
                title: pitch.providerName,
                subtitle: widget.group.serviceName,
                photoUrl: pitch.providerPhotoUrl,
                opening: pitch.pitch,
                status: pitch.status.id,
                initiatedBy: 'provider',
                createdAt: pitch.createdAt,
                lastMessage: pitch.lastMessage,
                lastMessageAt: pitch.lastMessageAt,
                lastSenderId: null,
                messageCount: pitch.messageCount,
                unread: pitch.unread,
                iAmSeeker: true,
                // A group has no phone switch of its own — sharing is set on the
                // group, not per pitch.
                showPhone: null,
                origin: null,
              ),
            ),
          ),
        )
        .then((_) => widget.onChanged());
  }

  @override
  Widget build(BuildContext context) {
    final pitch = widget.pitch;
    final waiting = pitch.status == PitchStatus.pending;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: waiting ? A91.grad1 : A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            // A pitch nobody has answered has no conversation to open yet: the
            // coach wrote once and cannot write again until they are let in.
            onTap: waiting ? null : _openThread,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _Avatar(pitch: pitch),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          pitch.providerName ?? 'A coach',
                          style: const TextStyle(
                            color: A91.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (!waiting)
                        Text(
                          pitch.status.label,
                          style:
                              const TextStyle(color: A91.faint, fontSize: 11.5),
                        ),
                    ],
                  ),
                  if (pitch.pitch != null &&
                      pitch.pitch!.trim().isNotEmpty) ...[
                    const SizedBox(height: 11),
                    Text(
                      pitch.pitch!.trim(),
                      maxLines: waiting ? 6 : 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: A91.muted, fontSize: 13.5, height: 1.5),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (waiting && pitch.isCreator) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    child: _Action(
                      label: 'No thanks',
                      busy: _busy,
                      onTap: () => _answer(false),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Action(
                      label: 'Talk to them',
                      primary: true,
                      busy: _busy,
                      onTap: () => _answer(true),
                    ),
                  ),
                ],
              ),
            ),
          ] else if (waiting) ...[
            const Divider(height: 1),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 11, 16, 12),
              child: Text(
                'Waiting on whoever started the group to answer.',
                style: TextStyle(color: A91.faint, fontSize: 12.5),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.pitch});

  final GroupPitch pitch;

  @override
  Widget build(BuildContext context) {
    final letter = (pitch.providerName ?? '?').characters.firstOrNull ?? '?';

    return Container(
      height: 40,
      width: 40,
      decoration: BoxDecoration(
        color: A91.surface2,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: A91.border),
        image: pitch.providerPhotoUrl == null
            ? null
            : DecorationImage(
                image: NetworkImage(pitch.providerPhotoUrl!),
                fit: BoxFit.cover,
              ),
      ),
      alignment: Alignment.center,
      child: pitch.providerPhotoUrl != null
          ? null
          : Text(
              letter.toUpperCase(),
              style: const TextStyle(
                  color: A91.faint, fontWeight: FontWeight.w700, fontSize: 16),
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
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: tone.withValues(alpha: 0.3)),
        ),
        child: Text(
          text,
          style: TextStyle(color: tone, fontSize: 12.5, height: 1.5),
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              alignment: Alignment.center,
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
