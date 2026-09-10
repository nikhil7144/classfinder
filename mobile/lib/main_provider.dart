import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/config/env.dart';
import 'src/data/supabase.dart';
import 'src/flavor.dart';

/// Entry point for the coaches' and organisers' app.
///
///   flutter run --flavor provider -t lib/main_provider.dart --dart-define=...
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  appFlavor = Flavor.provider;
  Env.assertConfigured();
  await initSupabase();
  runApp(const Aspire91App());
}
