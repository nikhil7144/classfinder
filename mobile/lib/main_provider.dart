import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  // ProviderScope is the root of everything Riverpod hands out. Nothing above
  // it, so a test can wrap the app and override any provider it likes.
  runApp(const ProviderScope(child: Aspire91App()));
}
