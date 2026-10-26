// SkeletonBox reads A91.surface3 and SkeletonPanel reads A91.surface/border,
// so neither is ever `const` below, and nor is any Row/Expanded that merely
// wraps one — a const instance would freeze that block at whatever colour it
// first rendered, instead of picking up a theme change the way the rest of
// the screen underneath it does. The analyzer does not know that, so it
// would otherwise flag every one of them as "could be const"; this file's
// const-free blocks are intentional, not missed.
// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables
import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// What a screen looks like while it loads.
///
/// A port of components/ui/PageSkeleton.tsx, including the reasoning in its
/// header note. The blocks sit one step above the card they lie on — surface-3
/// on surface — so the pulse reads as texture rather than as content that has
/// arrived. No shadows: this design system separates with borders.
///
/// Used where the shape of what is coming is knowable. A spinner is still
/// right for a wait with no shape — a save in flight, a photo uploading —
/// because a skeleton of something unknown is a guess drawn on screen.
///
/// One controller drives every block, so they pulse together the way CSS's
/// animate-pulse does. Giving each block its own would be a dozen tickers on a
/// screen that is, by definition, already waiting on something.
class Pulse extends StatefulWidget {
  const Pulse({super.key, required this.child});

  final Widget child;

  @override
  State<Pulse> createState() => _PulseState();
}

class _PulseState extends State<Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        // Never to zero. A block that disappears reads as a flash rather than
        // a pulse, and at 0.45 the layout stays legible throughout.
        opacity: Tween(begin: 1.0, end: 0.45).animate(
          CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
        ),
        child: widget.child,
      );
}

/// One loading block.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.height = 14,
    this.width,
    this.radius = 10,
  });

  final double height;

  /// Null fills the row. A paragraph reads better with its last line short.
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        width: width,
        decoration: BoxDecoration(
          color: A91.surface3,
          borderRadius: BorderRadius.circular(radius),
        ),
      );
}

/// A card the blocks lie on, matching the real cards' border and radius.
class SkeletonPanel extends StatelessWidget {
  const SkeletonPanel({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.all(16),
  });

  final List<Widget> children;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: padding,
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: A91.border),
          boxShadow: A91.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      );
}

/// A list of cards with a picture, two lines and some chips.
///
/// Shaped after CoachCard and the demand feed rather than being generic: a
/// skeleton that does not resemble what arrives is just a grey rectangle, and
/// the point of one is that the page does not jump when it fills in.
class ListSkeleton extends StatelessWidget {
  const ListSkeleton({
    super.key,
    this.rows = 4,
    this.avatar = true,
    this.shrinkWrap = false,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 16),
  });

  final int rows;
  final bool avatar;
  final bool shrinkWrap;

  /// The default assumes this is the whole screen's content. A caller that
  /// drops this into a list of its own that already carries the same
  /// horizontal padding should pass [EdgeInsets.zero] — otherwise the two
  /// stack, and the panels sit noticeably narrower than the real rows they
  /// are standing in for.
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Pulse(
        child: ListView.builder(
          shrinkWrap: shrinkWrap,
          physics: const NeverScrollableScrollPhysics(),
          padding: padding,
          itemCount: rows,
          itemBuilder: (context, i) => SkeletonPanel(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (avatar) ...[
                    SkeletonBox(height: 52, width: 52, radius: 16),
                    const SizedBox(width: 13),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(height: 16, width: 140),
                        SizedBox(height: 8),
                        SkeletonBox(height: 12, width: 90),
                      ],
                    ),
                  ),
                  SkeletonBox(height: 14, width: 58),
                ],
              ),
              const SizedBox(height: 14),
              SkeletonBox(height: 12),
              const SizedBox(height: 7),
              // The short last line is what makes a block read as a paragraph.
              SkeletonBox(height: 12, width: 180),
              const SizedBox(height: 14),
              Row(
                children: [
                  SkeletonBox(height: 24, width: 70, radius: 999),
                  SizedBox(width: 7),
                  SkeletonBox(height: 24, width: 54, radius: 999),
                  SizedBox(width: 7),
                  SkeletonBox(height: 24, width: 82, radius: 999),
                ],
              ),
            ],
          ),
        ),
      );
}

/// One thing in full: a photo, a heading, and some blocks of prose.
class DetailSkeleton extends StatelessWidget {
  const DetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Pulse(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 78, width: 78, radius: 22),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(height: 24, width: 170),
                      const SizedBox(height: 9),
                      SkeletonBox(height: 13, width: 110),
                      const SizedBox(height: 9),
                      SkeletonBox(height: 13, width: 140),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            SkeletonPanel(
              children: [
                SkeletonBox(height: 13),
                const SizedBox(height: 8),
                SkeletonBox(height: 13, width: 220),
              ],
            ),
            for (var i = 0; i < 3; i++) ...[
              const SizedBox(height: 22),
              SkeletonBox(height: 18, width: 120),
              const SizedBox(height: 12),
              SkeletonBox(height: 12),
              const SizedBox(height: 7),
              SkeletonBox(height: 12),
              const SizedBox(height: 7),
              SkeletonBox(height: 12, width: 200),
            ],
          ],
        ),
      );
}

/// A conversation, before its messages have arrived.
///
/// Shaped after _Bubble in thread_screen.dart — same alignment, same corner
/// radii, same max-width fraction of the screen — rather than a generic list
/// of bars, so the page does not reflow once the real bubbles replace these.
/// Alternating sides and varied widths read as a conversation in progress;
/// bubbles that were all the same width and side would read as a loading bar
/// wearing a chat screen's padding.
class ThreadSkeleton extends StatelessWidget {
  const ThreadSkeleton({super.key});

  /// (mine, fraction of the real bubble's own max width), cycled for as
  /// many rows as the screen needs — a fixed six left the bottom half of a
  /// tall phone bare while messages were still loading.
  static const _bubbles = <(bool, double)>[
    (false, 0.6),
    (false, 0.38),
    (true, 0.46),
    (false, 0.68),
    (true, 0.3),
    (true, 0.54),
  ];

  static const _rowHeight = 46.0;
  static const _rowGap = 10.0;

  @override
  Widget build(BuildContext context) {
    // Matches _Bubble's own constraint exactly, so a bubble's fraction below
    // is relative to the same cap the real one will render at.
    final maxWidth = MediaQuery.sizeOf(context).width * 0.76;
    return LayoutBuilder(
      builder: (context, constraints) {
        final rows = constraints.hasBoundedHeight
            ? (constraints.maxHeight / (_rowHeight + _rowGap)).ceil() + 1
            : _bubbles.length;
        return Pulse(
          child: ListView.builder(
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            itemCount: rows,
            itemBuilder: (context, i) {
              final (mine, fraction) = _bubbles[i % _bubbles.length];
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: maxWidth * fraction,
                  height: _rowHeight,
                  margin: const EdgeInsets.only(bottom: _rowGap),
                  decoration: BoxDecoration(
                    color: A91.surface3,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(mine ? 16 : 4),
                      bottomRight: Radius.circular(mine ? 4 : 16),
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

/// A list of notifications, before they arrive.
///
/// Shaped after _Row in notifications_screen.dart — same card border,
/// radius, padding and shadow, a bold title line, two body lines (the
/// second short, the way a real one reads once it is cut off), and a
/// timestamp — repeated to fill however tall the screen is, so opening a
/// long notification history does not show a bare lower half while the
/// first page is still in flight.
class NotificationsSkeleton extends StatelessWidget {
  const NotificationsSkeleton({super.key});

  static const _cardHeight = 100.0;
  static const _gap = 10.0;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final rows = constraints.hasBoundedHeight
              ? (constraints.maxHeight / (_cardHeight + _gap)).ceil() + 1
              : 6;
          return Pulse(
            child: ListView.builder(
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              itemCount: rows,
              itemBuilder: (context, i) => Container(
                height: _cardHeight,
                margin: const EdgeInsets.only(bottom: _gap),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: A91.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: A91.border),
                  boxShadow: A91.cardShadow,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(height: 14, width: 160),
                    const SizedBox(height: 8),
                    SkeletonBox(height: 12),
                    const SizedBox(height: 6),
                    SkeletonBox(height: 12, width: 120),
                    const Spacer(),
                    SkeletonBox(height: 10, width: 40),
                  ],
                ),
              ),
            ),
          );
        },
      );
}

/// A form: a heading and a stack of labelled fields.
class FormSkeleton extends StatelessWidget {
  const FormSkeleton({super.key, this.sections = 2, this.fields = 3});

  final int sections;
  final int fields;

  @override
  Widget build(BuildContext context) => Pulse(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            for (var s = 0; s < sections; s++)
              SkeletonPanel(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
                children: [
                  SkeletonBox(height: 12, width: 96),
                  const SizedBox(height: 20),
                  for (var f = 0; f < fields; f++) ...[
                    SkeletonBox(height: 12, width: 110),
                    const SizedBox(height: 9),
                    SkeletonBox(height: 46, radius: 14),
                    const SizedBox(height: 18),
                  ],
                ],
              ),
          ],
        ),
      );
}
