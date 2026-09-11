import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// The wordmark, at a size that suits the screen it is on.
///
/// The cropped one: the full lockup carries "Discover. Participate. Achieve."
/// inside the artwork, which is illegible much below 200px and duplicates the
/// tagline anywhere it is written as text.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.height = 40});

  final double height;

  @override
  Widget build(BuildContext context) => Image.asset(
        'assets/brand/wordmark.png',
        height: height,
        fit: BoxFit.contain,
      );
}

/// The label above a heading: mono, tracked, gold. Matches .cf-eyebrow.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: A91.eyebrow());
}
