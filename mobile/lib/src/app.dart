import 'dart:async';

import 'package:flutter/material.dart';
// Flutter's own services.dart exports an `appFlavor` getter (its own build
// flavor API, unrelated to this app's flavor.dart), which otherwise
// collides with the one this file actually means.
import 'package:flutter/services.dart' hide appFlavor;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'flavor.dart';
import 'providers.dart';
import 'push.dart';
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
    A91.resolve(
      mode,
      systemIsLight ? Brightness.light : Brightness.dark,
    );

    // A91's colours are plain static getters, not an InheritedWidget, so
    // nothing below this widget is told to rebuild just because the flag
    // above changed — reaching every screen requires each one to watch
    // themeModeProvider for itself. See SeekerShell/HomeShell and each
    // top-level screen for that half of this; two different attempts at
    // forcing it from this one spot instead (a changing Key on the routed
    // content, then a full element-tree walk calling markNeedsBuild()) each
    // touched machinery — the shells' always-alive tab Stack, then a
    // ListView's own lazy-child bookkeeping — that does not tolerate being
    // driven from outside its own cycle, and both ended in a crash on a
    // real device. Ordinary, per-widget ref.watch is slower to reach
    // everything but touches nothing it was not already safe to touch.

    // Fire-and-forget, not awaited: build() must stay synchronous, and
    // start() guards itself against running twice and against Firebase
    // never having initialized (see push.dart). This only sets up the
    // foreground display and the three tap entry points — registering
    // this device's own token happens separately, once the account is
    // known to be signed in (see SeekerShell/HomeShell), not here.
    unawaited(ref.read(pushServiceProvider).start());

    // A91.theme() already reads the flag just set above, so both slots get
    // the one ThemeData that matches it; themeMode is pinned to .light so
    // MaterialApp never tries to resolve brightness a second time on its
    // own and disagree with the resolution this widget already did.
    final resolved = A91.theme();

    // Most screens have no AppBar — Home, Students, Messages and the rest
    // build their own header out of an Eyebrow and a heading, not a real
    // Flutter AppBar — so AppBarTheme's own systemOverlayStyle (which does
    // correctly track A91.isLight) never gets a chance to apply on them.
    // Without this, the status bar and the gesture-nav bar keep whatever
    // colour and icon brightness Android last had, which is however the
    // OS felt like defaulting it, not A91.bg — on a light ground that
    // reads as a grey strip sitting above the page's actual putty
    // background, on dark as a seam the other way. One explicit region
    // around the whole app, read from the same flag everything else here
    // already reads from, replaces every screen having to set this for
    // itself.
    final overlay = SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarBrightness: A91.isLight ? Brightness.light : Brightness.dark,
      statusBarIconBrightness:
          A91.isLight ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: A91.bg,
      systemNavigationBarIconBrightness:
          A91.isLight ? Brightness.dark : Brightness.light,
      systemNavigationBarDividerColor: Colors.transparent,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlay,
      child: MaterialApp.router(
        title: appFlavor.appName,
        debugShowCheckedModeBanner: false,
        themeAnimationDuration: Duration.zero,
        routerConfig: ref.watch(routerProvider),
        theme: resolved,
        darkTheme: resolved,
        themeMode: ThemeMode.light,
      ),
    );
  }
}
