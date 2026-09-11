import 'package:supabase_flutter/supabase_flutter.dart';

import '../api_exception.dart';
import '../supabase.dart';

/// Signing in.
///
/// Email OTP, entered as a code rather than followed as a link. The code path
/// needs no deep links at all, which is why it is what ships first: a magic
/// link and the Google round trip both need assetlinks.json, an Apple App Site
/// Association file and the build machine's SHA-1 fingerprints, none of which
/// exist yet. See MOBILE-PLAN.md §5.
///
/// Auth is the one place the app talks to Supabase rather than the API. That
/// is deliberate and PLAN.md says so: the session, its refresh and realtime all
/// belong to the SDK.
class AuthRepository {
  const AuthRepository();

  Session? get session => supabase.auth.currentSession;

  bool get isSignedIn => session != null;

  /// Fires whenever the session changes — signed in, signed out, refreshed, or
  /// refresh failed. The router listens so a token expiring on a sleeping
  /// phone lands the user on sign-in rather than on a screen that 401s.
  Stream<AuthState> get changes => supabase.auth.onAuthStateChange;

  /// Send the code. shouldCreateUser matches the web: a coach who has never
  /// signed in gets an account from the same form.
  Future<void> sendCode(String email) async {
    try {
      await supabase.auth
          .signInWithOtp(email: email.trim(), shouldCreateUser: true);
    } on AuthException catch (e) {
      throw ApiException(e.message);
    } catch (_) {
      throw const ApiException(
          "Couldn't send the code. Check your connection and try again.");
    }
  }

  /// Verify it. `type: email` is what signInWithOtp issues for a code.
  Future<void> verifyCode({required String email, required String code}) async {
    try {
      final result = await supabase.auth.verifyOTP(
        email: email.trim(),
        token: code.trim(),
        type: OtpType.email,
      );
      if (result.session == null) {
        throw const ApiException(
            "That code didn't work — check it and try again.");
      }
    } on AuthException catch (e) {
      throw ApiException(e.message);
    }
  }

  Future<void> signOut() => supabase.auth.signOut();
}
