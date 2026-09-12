import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Charcoal & Coral, ported from app/globals.css.
///
/// The hexes are copied from the web's :root block rather than re-picked, so
/// the two clients cannot drift. Three rules come with them and are worth
/// keeping:
///
///   * the coral-to-gold gradient belongs to primary actions only,
///   * teal means approved / verified / success and nothing else,
///   * the taxonomy colours are one per service group and must never read as
///     buttons.
///
/// The product commits to a single dark look. There is no light theme.
class A91 {
  const A91._();

  static const bg = Color(0xFF0C0E10);
  static const surface = Color(0xFF17191C);
  static const surface2 = Color(0xFF1F2226);
  static const surface3 = Color(0xFF24272B);
  static const border = Color(0xFF2B2F33);
  static const borderSoft = Color(0xFF212427);

  static const ink = Color(0xFFF2F3F4);
  static const muted = Color(0xFF97A1A7);
  static const faint = Color(0xFF666E73);

  /// The CTA gradient. Primary actions only.
  static const grad1 = Color(0xFFFF6B4D);
  static const grad2 = Color(0xFFFFB238);
  static const accentInk = Color(0xFFFFD9A8);

  /// Ink colour on top of the gradient — the web uses this exact value.
  static const onAccent = Color(0xFF1A0D06);

  static const teal = Color(0xFF17B893);
  static const tealSoft = Color(0xFF12332C);
  static const danger = Color(0xFFF4655F);
  static const dangerSoft = Color(0xFF35191B);
  static const warn = Color(0xFFF5C244);

  // Taxonomy — one colour per service group.
  static const sport = Color(0xFF5B8DEF);
  static const wellness = Color(0xFF3ECF8E);
  static const mind = Color(0xFFA78BFA);
  static const indoor = Color(0xFFF5C244);
  static const dance = Color(0xFFFB7CAE);
  static const music = Color(0xFF8B93F8);
  static const subject = Color(0xFF4CC9F0);
  static const exam = Color(0xFFF472B6);
  static const acting = Color(0xFFF0A05A);

  static const ctaGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [grad1, grad2],
  );

  /// Manrope for body, Plus Jakarta Sans for display, JetBrains Mono for the
  /// eyebrow labels — the same three the web loads.
  static ThemeData theme() {
    final base = ThemeData.dark(useMaterial3: true);
    final text = GoogleFonts.manropeTextTheme(base.textTheme).apply(
      bodyColor: ink,
      displayColor: ink,
    );

    return base.copyWith(
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      colorScheme: base.colorScheme.copyWith(
        surface: surface,
        primary: grad1,
        secondary: grad2,
        error: danger,
        onPrimary: onAccent,
        onSurface: ink,
        outline: border,
      ),
      textTheme: text.copyWith(
        headlineLarge: GoogleFonts.plusJakartaSans(
          textStyle: text.headlineLarge,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
          color: ink,
        ),
        titleLarge: GoogleFonts.plusJakartaSans(
          textStyle: text.titleLarge,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.3,
          color: ink,
        ),
        bodyMedium: text.bodyMedium?.copyWith(color: muted, height: 1.55),
      ),
      // Chosen rather than inherited. Flutter's defaults differ per platform —
      // a slide on iOS, a fade-upwards on Android — and the two then match
      // neither each other nor the web. One shared motion, and a short one:
      // this is an app somebody opens between other things.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: _SharedAxisTransitionBuilder(),
          TargetPlatform.iOS: _SharedAxisTransitionBuilder(),
        },
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bg,
        surfaceTintColor: Colors.transparent,
        foregroundColor: ink,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: border),
        ),
      ),
      // Inputs were M3 defaults until the listing form arrived and put forty
      // of them on one screen. Filled and softly outlined, so a field reads as
      // a place to type without drawing a box around every line.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface2,
        hintStyle: const TextStyle(color: faint),
        labelStyle: const TextStyle(color: muted),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          // Coral at one pixel is a focus ring, not a call to action. The
          // gradient stays with PrimaryButton.
          borderSide: const BorderSide(color: grad1, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: danger, width: 1.4),
        ),
      ),
      dividerColor: border,
    );
  }

  /// How long a tab cross-fade takes. Long enough to read as a change, short
  /// enough not to be waited on.
  static const tabFade = Duration(milliseconds: 160);

  /// The colour for one of the eight taxonomy groups.
  ///
  /// A group added to the taxonomy after this shipped falls back to muted
  /// rather than throwing — a category with the wrong dot beside it is a far
  /// smaller problem than a screen that will not render.
  static Color group(String? name) => switch (name) {
        'sport' => sport,
        'wellness' => wellness,
        'mind' => mind,
        'indoor' => indoor,
        'dance' => dance,
        'music' => music,
        'subject' => subject,
        'exam' => exam,
        'acting' => acting,
        _ => muted,
      };

  /// The eyebrow: mono, uppercase, wide-tracked, gold. Used above headings.
  static TextStyle eyebrow() => GoogleFonts.jetBrainsMono(
        fontSize: 11.5,
        letterSpacing: 2.0,
        fontWeight: FontWeight.w500,
        color: grad2,
      );
}

/// A slide from the right with a fade, on both platforms.
///
/// Close to what iOS does natively and to what a web page does when it
/// navigates, which is the point: the product should feel like one thing on
/// three surfaces rather than like whatever each framework shipped.
class _SharedAxisTransitionBuilder extends PageTransitionsBuilder {
  const _SharedAxisTransitionBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );

    return SlideTransition(
      position: Tween(
        // A tenth of the width, not a full slide. A page that flies in from
        // off-screen reads as further away than it is.
        begin: const Offset(0.1, 0),
        end: Offset.zero,
      ).animate(curved),
      child: FadeTransition(opacity: curved, child: child),
    );
  }
}
