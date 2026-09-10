import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// Auth, realtime and Storage. Nothing else.
///
/// PLAN.md keeps exactly two doors open to Supabase from a client: realtime
/// (websockets with RLS applied per connection) and file bytes (uploads to
/// Storage against a signed URL). Everything else belongs to the API.
///
/// Reading an unmigrated table from here would work — RLS still applies — and
/// would make this the second client guessing at the schema, which is the
/// thing the API tier exists to prevent. See MOBILE-PLAN.md §2.
Future<void> initSupabase() async {
  await Supabase.initialize(
    url: Env.supabaseUrl,
    anonKey: Env.supabaseAnonKey,
  );
}

SupabaseClient get supabase => Supabase.instance.client;

/// The access token the API expects as a Bearer.
///
/// Read from the live session every time rather than cached: it is refreshed
/// underneath us, and a token held in a field goes stale without saying so.
/// The web client's lib/api/my-feed.ts makes the same point.
String? currentAccessToken() => supabase.auth.currentSession?.accessToken;
