import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the Light/Dark/System choice lives on disk.
///
/// Mobile's equivalent of the web's `localStorage` `cf-theme` key
/// (lib/theme.ts) — same three states, same default, different storage
/// mechanism because there is no `localStorage` here. `ThemeMode.system` is
/// Flutter's own name for the web's "auto": follow the OS, not a clock.
const _kThemeModeKey = 'a91_theme_mode';

/// Set once in `main()`, before `runApp()` — the same bootstrapping shape
/// `appFlavor` already has in flavor.dart. `ThemeModeNotifier.build()` reads
/// this rather than calling `loadThemeMode()` itself, because `build()` must
/// return synchronously and the loading already happened, earlier, in the
/// one place that can afford to await it.
late ThemeMode initialThemeMode;

/// Read once in `main()`, before `runApp()` — not inside a provider's own
/// async initializer. The web avoids a flash of the wrong ground with a
/// blocking inline script that runs before first paint; Dart has no
/// equivalent of "before first paint" once the engine is already running, so
/// the only way to get the same guarantee is to have the real value in hand
/// before the first frame is ever built.
Future<ThemeMode> loadThemeMode() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return switch (prefs.getString(_kThemeModeKey)) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  } catch (_) {
    // Blocked site data, or a plugin hiccup. System is the right default
    // when we cannot know what was chosen before.
    return ThemeMode.system;
  }
}

Future<void> writeThemeMode(ThemeMode mode) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    // ThemeMode.name gives exactly "light" / "dark" / "system".
    await prefs.setString(_kThemeModeKey, mode.name);
  } catch (_) {
    // Not fatal: the choice still applies for this session, it just will
    // not survive a restart. Better than refusing to switch.
  }
}
