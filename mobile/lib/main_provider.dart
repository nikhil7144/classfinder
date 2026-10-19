import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/config/env.dart';
import 'src/data/supabase.dart';
import 'src/data/theme_prefs.dart';
import 'src/flavor.dart';
import 'src/push.dart';

/// Entry point for the coaches' and organisers' app.
///
///   flutter run --flavor provider -t lib/main_provider.dart --dart-define=...
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  appFlavor = Flavor.provider;
  Env.assertConfigured();
  // Before runApp(), same as Supabase: Firebase requires init before
  // anything else touches it. Guarded internally — see push.dart — so a
  // build with no google-services.json for this flavor yet starts exactly
  // as it did before push existed.
  await PushService.initializeFirebase();
  await initSupabase();
  // Read before runApp(), not inside the provider's own init — see
  // theme_prefs.dart for why: it is what stands in for the web's blocking
  // inline script, so the very first frame already paints the right ground.
  initialThemeMode = await loadThemeMode();
  // ProviderScope is the root of everything Riverpod hands out. Nothing above
  // it, so a test can wrap the app and override any provider it likes.
  runApp(const ProviderScope(child: Aspire91App()));
}
 