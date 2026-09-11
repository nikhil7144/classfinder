import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/space.dart';
import '../../providers.dart';
import '../../theme/theme.dart';

/// One post, as it appears on a Space.
///
/// The reaction lands on screen before it lands on the server. A tap that
/// waits for a round trip feels broken on a phone, and the cost of being
/// optimistic here is small: a refusal puts the old count back and says why.
class PostCard extends ConsumerStatefulWidget {
  const PostCard({super.key, required this.post, this.canManage = false});

  final SpacePost post;

  /// The owner gets a delete. Nobody else does — and somebody else's post is a
  /// 404 to the service anyway, because saying "forbidden" would confirm it
  /// exists.
  final bool canManage;

  @override
  ConsumerState<PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<PostCard> {
  /// The post as this device believes it to be. Null until something is
  /// tapped, after which it is what renders.
  SpacePost? _optimistic;

  SpacePost get _post => _optimistic ?? widget.post;

  Future<void> _react(Reaction tapped) async {
    // Tapping the one you already gave takes it back. The service does not
    // toggle — it says so — so the decision is made here.
    final next = _post.myReaction == tapped ? null : tapped;
    final before = _post;

    setState(() => _optimistic = _post.withReaction(next));

    try {
      await ref.read(spacesRepositoryProvider).setReaction(_post.id, next);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _optimistic = before);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(e.message, style: const TextStyle(color: A91.ink)),
        ),
      );
    }
  }

  Future<void> _delete() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: A91.surface,
        title: const Text('Delete this post?'),
        content: const Text(
          'It goes from your Space for good. Reactions go with it.',
          style: TextStyle(color: A91.muted, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep it', style: TextStyle(color: A91.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete',
                style:
                    TextStyle(color: A91.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (sure != true) return;

    try {
      await ref.read(spacesRepositoryProvider).deletePost(_post.id);
      ref.invalidate(mySpacePostsProvider);
      // The count on the header is part of the Space, not the post list.
      ref.invalidate(mySpaceProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(e.message, style: const TextStyle(color: A91.ink)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final post = _post;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (post.isHidden) _HiddenNotice(reason: post.hiddenReason),
          if (post.isPhoto && post.imageUrl != null)
            _Photo(url: post.imageUrl!)
          else if (post.isVideo && post.youtubeId != null)
            _VideoThumb(youtubeId: post.youtubeId!),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (post.body != null && post.body!.trim().isNotEmpty) ...[
                  Text(
                    post.body!.trim(),
                    style: const TextStyle(
                        color: A91.ink, height: 1.5, fontSize: 14.5),
                  ),
                  const SizedBox(height: 12),
                ],
                Text(
                  _when(post.createdAt),
                  style: const TextStyle(color: A91.faint, fontSize: 11.5),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
            child: Row(
              children: [
                for (final r in Reaction.values)
                  _ReactionButton(
                    reaction: r,
                    count: post.countFor(r),
                    mine: post.myReaction == r,
                    onTap: () => _react(r),
                  ),
                const Spacer(),
                if (widget.canManage)
                  IconButton(
                    onPressed: _delete,
                    icon: const Icon(Icons.delete_outline,
                        size: 19, color: A91.faint),
                    tooltip: 'Delete',
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// "4 Sep", or the time if it is today. A post is read in a scroll, so the
  /// shortest thing that answers "when" is the right thing.
  static String _when(DateTime at) {
    final now = DateTime.now();
    final diff = now.difference(at);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    if (diff.inDays < 7) return '${diff.inDays} d ago';

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
    final month = months[at.month - 1];
    return at.year == now.year
        ? '${at.day} $month'
        : '${at.day} $month ${at.year}';
  }
}

class _Photo extends StatelessWidget {
  const _Photo({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) => AspectRatio(
        aspectRatio: 4 / 3,
        child: Image.network(
          url,
          fit: BoxFit.cover,
          loadingBuilder: (context, child, progress) => progress == null
              ? child
              : Container(
                  color: A91.surface2,
                  alignment: Alignment.center,
                  child: const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: A91.faint),
                  ),
                ),
          // A broken image is not worth an error state. The caption and the
          // reactions are still the post.
          errorBuilder: (context, _, __) => Container(
            color: A91.surface2,
            alignment: Alignment.center,
            child: const Icon(Icons.image_not_supported_outlined,
                color: A91.faint, size: 26),
          ),
        ),
      );
}

/// YouTube's own thumbnail, with a play badge over it.
///
/// No player embedded. Tapping would open YouTube, which needs a url launcher
/// this app does not carry yet — so for now it shows what the post is without
/// pretending to play it.
class _VideoThumb extends StatelessWidget {
  const _VideoThumb({required this.youtubeId});

  final String youtubeId;

  @override
  Widget build(BuildContext context) => AspectRatio(
        aspectRatio: 16 / 9,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              'https://img.youtube.com/vi/$youtubeId/hqdefault.jpg',
              fit: BoxFit.cover,
              errorBuilder: (context, _, __) => Container(color: A91.surface2),
            ),
            Container(color: Colors.black.withValues(alpha: 0.28)),
            const Center(
              child:
                  Icon(Icons.play_circle_fill, color: Colors.white, size: 54),
            ),
          ],
        ),
      );
}

class _HiddenNotice extends StatelessWidget {
  const _HiddenNotice({required this.reason});

  final String? reason;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        color: A91.dangerSoft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Only you can see this post',
              style: TextStyle(
                  color: A91.danger, fontWeight: FontWeight.w700, fontSize: 13),
            ),
            if (reason != null) ...[
              const SizedBox(height: 4),
              Text(reason!,
                  style: const TextStyle(
                      color: A91.muted, fontSize: 12.5, height: 1.45)),
            ],
          ],
        ),
      );
}

class _ReactionButton extends StatelessWidget {
  const _ReactionButton({
    required this.reaction,
    required this.count,
    required this.mine,
    required this.onTap,
  });

  final Reaction reaction;
  final int count;
  final bool mine;
  final VoidCallback onTap;

  IconData get _icon => switch (reaction) {
        Reaction.like => Icons.favorite,
        Reaction.wow => Icons.auto_awesome,
        Reaction.surprise => Icons.bolt,
      };

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(_icon, size: 17, color: mine ? A91.grad1 : A91.faint),
                if (count > 0) ...[
                  const SizedBox(width: 6),
                  Text(
                    '$count',
                    style: TextStyle(
                      color: mine ? A91.ink : A91.faint,
                      fontSize: 12.5,
                      fontWeight: mine ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
}
