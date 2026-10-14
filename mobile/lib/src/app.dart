import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'flavor.dart';
import 'providers.dart';
import 'router.dart';
import 'theme/theme.dart';

/// The shared shell. Both flavors run this; only `appFlavor` differs.
class Aspire91App extends ConsumerWidget {
  const Aspire91App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    // MediaQuery, not a WidgetsBindingObserver: reading platform brightness
    // this way registers the dependency Flutter needs to rebuild this widget
    // on its own when the OS flips at sunset — the same thing the web's
    // prefers-color-scheme media-query listener does for "auto".
    final systemIsLight =
        MediaQuery.platformBrightnessOf(context) == Brightness.light;
    A91.isLight = switch (mode) {
      ThemeMode.light => true,
      ThemeMode.dark => false,
      ThemeMode.system => systemIsLight,
    };

    // A91.theme() already reads the flag just set above, so both slots get
    // the one ThemeData that matches it; themeMode is pinned to .light so
    // MaterialApp never tries to resolve brightness a second time on its
    // own and disagree with the resolution this widget already did.
    final resolved = A91.theme();
    return MaterialApp.router(
      title: appFlavor.appName,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      theme: resolved,
      darkTheme: resolved,
      themeMode: ThemeMode.light,
    );
  }
}
