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
  const ListSkeleton({super.key, this.rows = 4, this.avatar = true});

  final int rows;
  final bool avatar;

  @override
  Widget build(BuildContext context) => Pulse(
        child: ListView.builder(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          itemCount: rows,
          itemBuilder: (context, i) => SkeletonPanel(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (avatar) ...[
                    const SkeletonBox(height: 52, width: 52, radius: 16),
                    const SizedBox(width: 13),
                  ],
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(height: 16, width: 140),
                        SizedBox(height: 8),
                        SkeletonBox(height: 12, width: 90),
                      ],
                    ),
                  ),
                  const SkeletonBox(height: 14, width: 58),
                ],
              ),
              const SizedBox(height: 14),
              const SkeletonBox(height: 12),
              const SizedBox(height: 7),
              // The short last line is what makes a block read as a paragraph.
              const SkeletonBox(height: 12, width: 180),
              const SizedBox(height: 14),
              const Row(
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
            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 78, width: 78, radius: 22),
                SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(height: 24, width: 170),
                      SizedBox(height: 9),
                      SkeletonBox(height: 13, width: 110),
                      SizedBox(height: 9),
                      SkeletonBox(height: 13, width: 140),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            const SkeletonPanel(
              children: [
                SkeletonBox(height: 13),
                SizedBox(height: 8),
                SkeletonBox(height: 13, width: 220),
              ],
            ),
            for (var i = 0; i < 3; i++) ...[
              const SizedBox(height: 22),
              const SkeletonBox(height: 18, width: 120),
              const SizedBox(height: 12),
              const SkeletonBox(height: 12),
              const SizedBox(height: 7),
              const SkeletonBox(height: 12),
              const SizedBox(height: 7),
              const SkeletonBox(height: 12, width: 200),
            ],
          ],
        ),
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
                  const SkeletonBox(height: 12, width: 96),
                  const SizedBox(height: 20),
                  for (var f = 0; f < fields; f++) ...[
                    const SkeletonBox(height: 12, width: 110),
                    const SizedBox(height: 9),
                    const SkeletonBox(height: 46, radius: 14),
                    const SizedBox(height: 18),
                  ],
                ],
              ),
          ],
        ),
      );
}
