import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/config/env.dart';
import 'src/data/supabase.dart';
import 'src/flavor.dart';

/// Entry point for the parents' app.
///
///   flutter run --flavor seeker -t lib/main_seeker.dart --dart-define=...
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  appFlavor = Flavor.seeker;
  Env.assertConfigured();
  await initSupabase();
  runApp(const Aspire91App());
}
