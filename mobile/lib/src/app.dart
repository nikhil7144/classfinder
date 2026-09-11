import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'flavor.dart';
import 'router.dart';
import 'theme/theme.dart';

/// The shared shell. Both flavors run this; only `appFlavor` differs.
class Aspire91App extends ConsumerWidget {
  const Aspire91App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: appFlavor.appName,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      theme: A91.theme(),
      // One dark look, as on the web. There is no light theme to fall back to.
      themeMode: ThemeMode.dark,
      darkTheme: A91.theme(),
    );
  }
}
