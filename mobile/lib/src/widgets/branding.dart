import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

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
        'assets/brand/aspire_app_icon.png',
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

/// Google's own four-colour G — the exact paths from `GoogleMark` in
/// `components/AuthForm.tsx`, so the app's "Continue with Google" carries the
/// same mark the website's does. Their sign-in branding asks for this rather
/// than a Gmail envelope or a recoloured glyph, and — same reasoning as the
/// web component — its fills are Google's brand hexes rather than this app's
/// palette, because the mark is not ours to recolour.
class GoogleMark extends StatelessWidget {
  const GoogleMark({super.key, this.size = 18});

  final double size;

  static const _svg = '''
<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
</svg>
''';

  @override
  Widget build(BuildContext context) =>
      SvgPicture.string(_svg, width: size, height: size);
}
