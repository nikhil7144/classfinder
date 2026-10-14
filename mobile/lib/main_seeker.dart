import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/config/env.dart';
import 'src/data/supabase.dart';
import 'src/data/theme_prefs.dart';
import 'src/flavor.dart';

/// Entry point for the parents' app.
///
///   flutter run --flavor seeker -t lib/main_seeker.dart --dart-define=...
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  appFlavor = Flavor.seeker;
  Env.assertConfigured();
  await initSupabase();
  // Read before runApp(), not inside the provider's own init — see
  // theme_prefs.dart for why: it is what stands in for the web's blocking
  // inline script, so the very first frame already paints the right ground.
  initialThemeMode = await loadThemeMode();
  // ProviderScope is the root of everything Riverpod hands out. Nothing above
  // it, so a test can wrap the app and override any provider it likes.
  runApp(const ProviderScope(child: Aspire91App()));
}
