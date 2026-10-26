import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../config/env.dart';

import '../../data/api_exception.dart';
import '../../data/models/group.dart';
import '../../data/models/thread.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import '../threads/thread_screen.dart';
import 'group_post_composer_screen.dart';

/// One group — /groups/[id].
///
/// Three things on one screen, because they are parts of the same job: what
/// the group is and how long it has, the coaches who have pitched to it, and
/// what the group has posted. A section rather than tabs for the same reason
/// as always — tabs would hide the pitches, which are the only reason
/// anybody opens this twice.
///
/// Opened only from "My groups" (groups_screen.dart), so the viewer is always
/// a member — no membership check guards the Posts section below. A
/// non-member entry point added later would need one.
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

  @override
  void initState() {
    super.initState();
    // Both are cached by Riverpod past this visit, so without this a second
    // trip into the same group — or a first trip into a different one right
    // after — would show whatever the cache already has, with no fetch and
    // no shimmer, even though a coach could have pitched or a member could
    // have posted since the cache was filled.
    ref.invalidate(groupPitchesProvider(widget.group.id));
    ref.invalidate(groupPostsProvider(widget.group.id));
  }

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
      'Join us: ${Env.siteUrl}/groups/${_g.id}',
      subject: 'Join our Aspire91 group',
    );
  }

  Future<void> _leave() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: A91.surface,
        title: const Text('Leave this group?'),
        content: Text(
          'You stop seeing the coaches who pitch to it. The group carries on '
          'without you.',
          style: TextStyle(color: A91.muted, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Stay', style: TextStyle(color: A91.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Leave',
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

  void _openComposer() {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => ThemeAware(
              builder: (_) => GroupPostComposerScreen(groupId: _g.id),
            ),
          ),
        )
        .then((_) => ref.invalidate(groupPostsProvider(_g.id)));
  }

  @override
  Widget build(BuildContext context) {
    final pitches = ref.watch(groupPitchesProvider(_g.id));
    final posts = ref.watch(groupPostsProvider(_g.id));

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
          color: A91.coral,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(groupPitchesProvider(_g.id));
            ref.invalidate(groupPostsProvider(_g.id));
            ref.invalidate(myGroupsProvider);
            await Future.wait([
              ref.read(groupPitchesProvider(_g.id).future),
              ref.read(groupPostsProvider(_g.id).future),
            ]);
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
                    style: TextStyle(color: A91.danger, fontSize: 13),
                  ),
                ),
              ],
              const SizedBox(height: 26),
              Text('Coaches who pitched',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              ...pitches.when(
                loading: () => [
                  const ListSkeleton(
                    rows: 2,
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                  ),
                ],
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
              const SizedBox(height: 26),
              Row(
                children: [
                  Expanded(
                    child: Text('Posts',
                        style: Theme.of(context).textTheme.titleLarge),
                  ),
                  if (_g.isActive)
                    _Action(
                      label: 'Post a photo',
                      busy: false,
                      onTap: _openComposer,
                    ),
                ],
              ),
              if (!_g.isActive) ...[
                const SizedBox(height: 6),
                Text(
                  '${_g.dormantReason} — nobody can post until then.',
                  style: TextStyle(color: A91.faint, fontSize: 12.5),
                ),
              ],
              const SizedBox(height: 12),
              ...posts.when(
                loading: () => [
                  const ListSkeleton(
                    avatar: false,
                    rows: 2,
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                  ),
                ],
                error: (error, _) => [
                  ErrorState(
                    message: error is ApiException
                        ? error.message
                        : 'Something went wrong loading the posts.',
                    onRetry: () => ref.invalidate(groupPostsProvider(_g.id)),
                  ),
                ],
                data: (posts) => posts.isEmpty
                    ? [
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: A91.surface,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: A91.borderSoft),
                            boxShadow: A91.cardShadow,
                          ),
                          child: Text(
                            'Nothing posted yet. Photos from your sessions '
                            'go here.',
                            style: TextStyle(
                                color: A91.muted, fontSize: 13, height: 1.55),
                          ),
                        ),
                      ]
                    : [
                        for (final post in posts)
                          _PostCard(
                            post: post,
                            onChanged: () =>
                                ref.invalidate(groupPostsProvider(_g.id)),
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
        boxShadow: A91.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Not `const`: Eyebrow's style reads A91.gold.
          // ignore: prefer_const_constructors
          Eyebrow('Your group'),
          const SizedBox(height: 10),
          Text(
            [
              if (_g.societyName != null) _g.societyName!,
              if (_g.areaName != null) _g.areaName!,
            ].join(' · '),
            style: TextStyle(
                color: A91.ink, fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            '${_g.memberCount} ${_g.memberCount == 1 ? 'family' : 'families'} '
            'so far, asking for ${_g.studentCount} '
            '${_g.studentCount == 1 ? 'place' : 'places'}',
            style: TextStyle(color: A91.muted, fontSize: 13),
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
          boxShadow: A91.cardShadow,
        ),
        child: Text(
          _g.isActive
              ? 'Nobody has pitched yet. Coaches in the area can see this '
                  'group and will write when they can take it.'
              : 'Coaches cannot see this group at the moment, so nobody can '
                  'pitch to it.',
          style: TextStyle(color: A91.muted, fontSize: 13, height: 1.55),
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
          content: Text(e.message, style: TextStyle(color: A91.ink)),
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
            builder: (_) => ThemeAware(
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
                  // A group has no phone switch of its own — sharing is set
                  // on the group, not per pitch.
                  showPhone: null,
                  origin: null,
                ),
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
        border: Border.all(color: waiting ? A91.coral : A91.border),
        boxShadow: A91.cardShadow,
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
                          style: TextStyle(
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
                              TextStyle(color: A91.faint, fontSize: 11.5),
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
                      style: TextStyle(
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 11, 16, 12),
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
              style: TextStyle(
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
                border: Border.all(color: primary ? A91.coral : A91.border),
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

/// One photo a member has posted, as it appears on the group's own page.
///
/// The overflow menu is on `post.isMine` and nobody else — the creator's own
/// account gets no menu on a post that is not theirs, same as the API's own
/// rule: only the author moves a post to the public page, because a creator
/// who could promote any post could publish another family's child's photo
/// without asking them.
class _PostCard extends ConsumerStatefulWidget {
  const _PostCard({required this.post, required this.onChanged});

  final GroupPost post;
  final VoidCallback onChanged;

  @override
  ConsumerState<_PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<_PostCard> {
  bool _busy = false;

  Future<void> _setVisibility(bool public) async {
    if (public) {
      final sure = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: A91.surface,
          title: const Text('Show this on your group page?'),
          content: Text(
            "Anyone can see this photo on your group's public page once the "
            'group is published.',
            style: TextStyle(color: A91.muted, height: 1.5),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text('Not yet', style: TextStyle(color: A91.muted)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text('Show it',
                  style: TextStyle(
                      color: A91.coral, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      );
      if (sure != true) return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(groupsRepositoryProvider)
          .setPostVisibility(widget.post.id, public: public);
      widget.onChanged();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(e.message, style: TextStyle(color: A91.ink)),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: A91.surface,
        title: const Text('Delete this post?'),
        content: Text(
          'It goes from the group for good.',
          style: TextStyle(color: A91.muted, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Keep it', style: TextStyle(color: A91.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Delete',
                style:
                    TextStyle(color: A91.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (sure != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(groupsRepositoryProvider).deletePost(widget.post.id);
      widget.onChanged();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(e.message, style: TextStyle(color: A91.ink)),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openFullscreen(String url) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _FullscreenImage(url: url),
        fullscreenDialog: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.post;

    return Opacity(
      opacity: _busy ? 0.6 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: A91.border),
          boxShadow: A91.cardShadow,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (post.imageUrl != null)
              GestureDetector(
                onTap: _busy ? null : () => _openFullscreen(post.imageUrl!),
                child: _PostImage(url: post.imageUrl!),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (post.body != null && post.body!.trim().isNotEmpty) ...[
                          Text(
                            post.body!.trim(),
                            style: TextStyle(
                                color: A91.ink, height: 1.5, fontSize: 14),
                          ),
                          const SizedBox(height: 10),
                        ],
                        _PostBadge(
                          label: post.isPublic
                              ? 'On the group page'
                              : 'Members only',
                          tone: post.isPublic ? A91.teal : A91.faint,
                        ),
                      ],
                    ),
                  ),
                  if (post.isMine)
                    PopupMenuButton<String>(
                      icon: Icon(Icons.more_vert, size: 19, color: A91.faint),
                      color: A91.surface,
                      onSelected: (value) {
                        if (value == 'delete') {
                          _delete();
                        } else {
                          _setVisibility(value == 'public');
                        }
                      },
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          value: post.isPublic ? 'members' : 'public',
                          child: Text(
                            post.isPublic
                                ? 'Make it members only'
                                : 'Show on group page',
                            style: TextStyle(color: A91.ink, fontSize: 13.5),
                          ),
                        ),
                        PopupMenuItem(
                          value: 'delete',
                          child: Text('Delete',
                              style: TextStyle(
                                  color: A91.danger, fontSize: 13.5)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PostImage extends StatelessWidget {
  const _PostImage({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 200,
        width: double.infinity,
        child: Image.network(
          url,
          fit: BoxFit.cover,
          loadingBuilder: (context, child, progress) => progress == null
              ? child
              : Container(
                  color: A91.surface2,
                  alignment: Alignment.center,
                  child: SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: A91.faint),
                  ),
                ),
          errorBuilder: (context, _, __) => Container(
            color: A91.surface2,
            alignment: Alignment.center,
            child: Icon(Icons.image_not_supported_outlined,
                color: A91.faint, size: 26),
          ),
        ),
      );
}

class _PostBadge extends StatelessWidget {
  const _PostBadge({required this.label, required this.tone});

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
              color: tone, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      );
}

/// A post's photo, full screen and pinch-zoomable. Nice to have, not load
/// bearing — tapping back is the only way out, and that is enough for a
/// photo nobody needs to do anything else with.
class _FullscreenImage extends StatelessWidget {
  const _FullscreenImage({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        body: Center(
          child: InteractiveViewer(
            child: Image.network(url, fit: BoxFit.contain),
          ),
        ),
      );
}
