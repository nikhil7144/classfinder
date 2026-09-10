import 'package:flutter/material.dart';

import 'features/home/placeholder_home.dart';
import 'flavor.dart';
import 'theme/theme.dart';

/// The shared shell. Both flavors run this; only `appFlavor` differs.
class Aspire91App extends StatelessWidget {
  const Aspire91App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: appFlavor.appName,
      debugShowCheckedModeBanner: false,
      theme: A91.theme(),
      // One dark look, as on the web. No light theme to fall back to.
      themeMode: ThemeMode.dark,
      darkTheme: A91.theme(),
      home: const PlaceholderHome(),
    );
  }
}
