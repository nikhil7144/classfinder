import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Charcoal & Coral, ported from app/globals.css.
///
/// The hexes are copied from the web's :root blocks rather than re-picked,
/// so the two clients cannot drift. Three rules come with them and are
/// worth keeping:
///
///   * the coral-to-gold gradient belongs to primary actions only,
///   * teal means approved / verified / success and nothing else,
///   * the taxonomy colours are one per service group and must never read
///     as buttons.
///
/// Two grounds, as on the web (lib/theme.ts, app/globals.css). Dark stays
/// the default and the identity — [isLight] starts false, and every call
/// site that read a bare `A91.ink` before this existed keeps working
/// unchanged until something actually switches the mode.
///
/// [isLight] is a plain static field, not a provider, on purpose: these
/// getters are called from hundreds of places with no BuildContext to hand
/// them — exactly the shape `A91.ink` already had everywhere before light
/// mode existed, and changing that shape would have meant touching every
/// one of those call sites instead of one. `Aspire91App.build()` sets it
/// once, synchronously, before returning the widget tree Flutter is about
/// to build — which is early enough that every descendant's own build()
/// sees the new value, the same way a `const` constant was always visible
/// to everything below it.
class A91 {
  const A91._();

  /// Set by `Aspire91App.build()` from the resolved ThemeMode, every
  /// rebuild. Nothing else should write to this.
  static bool isLight = false;

  // --- Grounds --------------------------------------------------------
  static Color get bg => isLight ? _Light.bg : _Dark.bg;
  static Color get surface => isLight ? _Light.surface : _Dark.surface;
  static Color get surface2 => isLight ? _Light.surface2 : _Dark.surface2;
  static Color get surface3 => isLight ? _Light.surface3 : _Dark.surface3;
  static Color get border => isLight ? _Light.border : _Dark.border;
  static Color get borderSoft =>
      isLight ? _Light.borderSoft : _Dark.borderSoft;

  // --- Text -------------------------------------------------------------
  static Color get ink => isLight ? _Light.ink : _Dark.ink;
  static Color get muted => isLight ? _Light.muted : _Dark.muted;
  static Color get faint => isLight ? _Light.faint : _Dark.faint;

  /// The CTA gradient's own fill stops. Identical in both themes — coral to
  /// gold on white is the same brand mark as on charcoal — which is exactly
  /// why these are NOT used as text or icon colour anywhere: see [coral] and
  /// [gold] below for that role, which does change.
  static const grad1 = Color(0xFFFF6B4D);
  static const grad2 = Color(0xFFFFB238);

  /// Accent FOREGROUNDS — links, eyebrows, borders, icon glyphs, active
  /// switches. Equal to [grad1]/[grad2] in dark, where fill and text colour
  /// happen to coincide; darkened for light; where `--gold` at its dark
  /// value is 1.8:1 on white; see app/globals.css's note on this exact
  /// number. Before this split existed, every one of those call sites read
  /// grad1/grad2 directly, which is correct only by accident of dark mode
  /// never having had to tell the two roles apart.
  static Color get coral => isLight ? _Light.coral : _Dark.coral;
  static Color get gold => isLight ? _Light.gold : _Dark.gold;

  static Color get accentInk => isLight ? _Light.accentInk : _Dark.accentInk;

  /// Ink colour on top of the gradient or an [accentInk] fill. Diverges in
  /// light: the fill is dark there, so its text is the pale one — the pair
  /// swaps roles, the token keeps its name.
  static Color get onAccent => isLight ? _Light.onAccent : _Dark.onAccent;

  static Color get teal => isLight ? _Light.teal : _Dark.teal;
  static Color get tealSoft => isLight ? _Light.tealSoft : _Dark.tealSoft;
  static Color get danger => isLight ? _Light.danger : _Dark.danger;
  static Color get dangerSoft =>
      isLight ? _Light.dangerSoft : _Dark.dangerSoft;
  static Color get warn => isLight ? _Light.warn : _Dark.warn;
  static Color get warnSoft => isLight ? _Light.warnSoft : _Dark.warnSoft;

  // --- Taxonomy — one colour per service group. -----------------------
  static Color get sport => isLight ? _Light.sport : _Dark.sport;
  static Color get wellness => isLight ? _Light.wellness : _Dark.wellness;
  static Color get mind => isLight ? _Light.mind : _Dark.mind;
  static Color get indoor => isLight ? _Light.indoor : _Dark.indoor;
  static Color get dance => isLight ? _Light.dance : _Dark.dance;
  static Color get music => isLight ? _Light.music : _Dark.music;
  static Color get subject => isLight ? _Light.subject : _Dark.subject;
  static Color get exam => isLight ? _Light.exam : _Dark.exam;
  static Color get acting => isLight ? _Light.acting : _Dark.acting;

  static const ctaGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [grad1, grad2],
  );

  /// Manrope for body, Plus Jakarta Sans for display, JetBrains Mono for the
  /// eyebrow labels — the same three the web loads.
  ///
  /// Reads every colour above through its getter, so calling this after
  /// [isLight] changes always builds the ThemeData for whichever ground is
  /// current — there is no separate lightTheme()/darkTheme() pair to keep
  /// in sync, only this and the flag.
  static ThemeData theme() {
    final base =
        isLight ? ThemeData.light(useMaterial3: true) : ThemeData.dark(useMaterial3: true);
    final text = GoogleFonts.manropeTextTheme(base.textTheme).apply(
      bodyColor: ink,
      displayColor: ink,
    );

    return base.copyWith(
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      colorScheme: base.colorScheme.copyWith(
        brightness: isLight ? Brightness.light : Brightness.dark,
        surface: surface,
        primary: coral,
        secondary: gold,
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
      appBarTheme: AppBarTheme(
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
          side: BorderSide(color: border),
        ),
      ),
      // Inputs were M3 defaults until the listing form arrived and put forty
      // of them on one screen. Filled and softly outlined, so a field reads as
      // a place to type without drawing a box around every line.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface2,
        hintStyle: TextStyle(color: faint),
        labelStyle: TextStyle(color: muted),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          // Coral at one pixel is a focus ring, not a call to action. The
          // gradient stays with PrimaryButton.
          borderSide: BorderSide(color: coral, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: danger, width: 1.4),
        ),
      ),
      dividerColor: border,
    );
  }

  /// How long a tab cross-fade takes. Long enough to read as a change, short
  /// enough not to be waited on.
  static const tabFade = Duration(milliseconds: 160);

  /// The colour for one of the ten taxonomy groups.
  ///
  /// A group added to the taxonomy after this shipped falls back to muted
  /// rather than throwing — a category with the wrong dot beside it is a far
  /// smaller problem than a screen that will not render.
  ///
  /// Four of these keys were the colour's name rather than the group's, so
  /// wellness_fitness, mind_game, indoor_game and exam_board had all been
  /// falling through to muted since they shipped. The fallback is why nobody
  /// noticed: it degrades quietly, which is the point and also the risk.
  static Color group(String? name) => switch (name) {
        'sport' => sport,
        'wellness_fitness' => wellness,
        'mind_game' => mind,
        'indoor_game' => indoor,
        'dance' => dance,
        'music' => music,
        'subject' => subject,
        'exam_board' => exam,
        'competitive_exam' => exam,
        'acting' => acting,
        _ => muted,
      };

  /// The eyebrow: mono, uppercase, wide-tracked, gold. Used above headings.
  static TextStyle eyebrow() => GoogleFonts.jetBrainsMono(
        fontSize: 11.5,
        letterSpacing: 2.0,
        fontWeight: FontWeight.w500,
        color: gold,
      );
}

/// Dark — the brand's committed look, and the default. Values match
/// app/globals.css's `:root, :root[data-theme="dark"]` block exactly.
abstract class _Dark {
  static const bg = Color(0xFF0C0E10);
  static const surface = Color(0xFF17191C);
  static const surface2 = Color(0xFF1F2226);
  static const surface3 = Color(0xFF24272B);
  static const border = Color(0xFF2B2F33);
  static const borderSoft = Color(0xFF212427);

  static const ink = Color(0xFFF2F3F4);
  // Raised from #97a1a7 / #666e73 after the web was read outdoors: --faint
  // was 3.4:1 on a card, below the 4.5 AA text needs, under 143 labels. The
  // same fix applies here for the same reason — nothing about reading a
  // phone outdoors is different from reading a laptop outdoors.
  static const muted = Color(0xFFB3BCC2);
  static const faint = Color(0xFF8B949B);

  static const coral = Color(0xFFFF6B4D);
  static const gold = Color(0xFFFFB238);
  static const accentInk = Color(0xFFFFD9A8);
  static const onAccent = Color(0xFF1A0D06);

  static const teal = Color(0xFF17B893);
  static const tealSoft = Color(0xFF12332C);
  static const danger = Color(0xFFF4655F);
  static const dangerSoft = Color(0xFF35191B);
  static const warn = Color(0xFFF5C244);
  static const warnSoft = Color(0xFF3A2F12);

  static const sport = Color(0xFF5B8DEF);
  static const wellness = Color(0xFF3ECF8E);
  static const mind = Color(0xFFA78BFA);
  static const indoor = Color(0xFFF5C244);
  static const dance = Color(0xFFFB7CAE);
  static const music = Color(0xFF8B93F8);
  static const subject = Color(0xFF4CC9F0);
  static const exam = Color(0xFFF472B6);
  static const acting = Color(0xFFF0A05A);
}

/// Light — not an inversion. Values match app/globals.css's
/// `:root[data-theme="light"]` block exactly; see its own comment there for
/// why three groups (accent foregrounds, taxonomy, state tints) had to be
/// redrawn rather than flipped, and why surface-3 rather than white is the
/// binding contrast constraint throughout.
abstract class _Light {
  // Warm putty, not cool grey — see globals.css's note on why: a white card
  // then separates from its ground by temperature as well as lightness.
  static const bg = Color(0xFFF4F2F0);
  static const surface = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFFAF9F8);
  static const surface3 = Color(0xFFEFEDEA);
  static const border = Color(0xFFE3DFDB);
  static const borderSoft = Color(0xFFF0ECE8);

  static const ink = Color(0xFF14171A);
  static const muted = Color(0xFF4B545A);
  static const faint = Color(0xFF5D666C);

  static const coral = Color(0xFFB33A1D);
  static const gold = Color(0xFF8F5803);
  static const accentInk = Color(0xFF7C2D12);
  // Diverges from dark: the accentInk fill is dark here, so its text is the
  // pale one — the pair swaps roles, the token keeps its name.
  static const onAccent = Color(0xFFFFF5EE);

  static const teal = Color(0xFF0D6961);
  static const tealSoft = Color(0xFFD6F3EC);
  static const danger = Color(0xFFC0362F);
  static const dangerSoft = Color(0xFFFDE8E6);
  static const warn = Color(0xFF855708);
  static const warnSoft = Color(0xFFFDF0D2);

  static const sport = Color(0xFF2C5FC4);
  static const wellness = Color(0xFF0D6B4B);
  static const mind = Color(0xFF6D4BD1);
  static const indoor = Color(0xFF7D5905);
  static const dance = Color(0xFFB02F66);
  static const music = Color(0xFF4A52D4);
  static const subject = Color(0xFF0A6880);
  static const exam = Color(0xFFBC2F6E);
  static const acting = Color(0xFFA1540F);
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
