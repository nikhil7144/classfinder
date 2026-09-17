import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config/env.dart';
import '../../flavor.dart';
import '../api_exception.dart';
import '../supabase.dart';

/// Signing in.
///
/// Email OTP, entered as a code rather than followed as a link. The code path
/// needs no deep links at all, which is why it shipped first. The magic link
/// and Google sign-in below need a custom URL scheme registered on both
/// platforms (done — see `Flavor.authRedirectUrl`) plus that scheme on
/// Supabase's redirect allowlist and, for Google, real OAuth client ids in
/// Google Cloud Console (neither of those exists yet — see README §7/§10.4).
///
/// Auth is the one place the app talks to Supabase rather than the API. That
/// is deliberate and PLAN.md says so: the session, its refresh and realtime all
/// belong to the SDK.
class AuthRepository {
  const AuthRepository();

  /// `serverClientId` rather than a bare `GoogleSignIn()`: it is what makes
  /// the id token this returns acceptable to Supabase's Google provider,
  /// which is configured with that same web client. The Android/iOS client
  /// ids are never referenced here — they live only in Google Cloud Console,
  /// matched to this app by package name and SHA-1/bundle id.
  static final _googleSignIn =
      GoogleSignIn(serverClientId: Env.googleWebClientId);

  Session? get session => supabase.auth.currentSession;

  bool get isSignedIn => session != null;

  /// The address they sign in with. Empty only in the moment between a sign-out
  /// and the router noticing.
  String get email => supabase.auth.currentUser?.email ?? '';

  /// Fires whenever the session changes — signed in, signed out, refreshed, or
  /// refresh failed. The router listens so a token expiring on a sleeping
  /// phone lands the user on sign-in rather than on a screen that 401s.
  Stream<AuthState> get changes => supabase.auth.onAuthStateChange;

  /// Send the code. shouldCreateUser matches the web: a coach who has never
  /// signed in gets an account from the same form.
  ///
  /// `emailRedirectTo` is what makes the *link* in that same email (as
  /// opposed to the code, which is what the screen actually asks for) return
  /// into this app instead of the web's `/auth/callback` page — harmless to
  /// set even though nothing in the UI surfaces that link today.
  Future<void> sendCode(String email) async {
    try {
      await supabase.auth.signInWithOtp(
        email: email.trim(),
        shouldCreateUser: true,
        emailRedirectTo: appFlavor.authRedirectUrl,
      );
    } on AuthException catch (e) {
      throw ApiException(e.message);
    } catch (_) {
      throw const ApiException(
          "Couldn't send the code. Check your connection and try again.");
    }
  }

  /// Whether the Google button has anything to call — no web client id, no
  /// button. See `Env.googleWebClientId`.
  bool get googleSignInAvailable => Env.googleWebClientId.isNotEmpty;

  /// Native sign-in through Google Play Services / the iOS SDK — never a
  /// webview, which Google blocks for OAuth. Needs no deep link and no
  /// browser round trip: Google hands back an id token directly, and
  /// `signInWithIdToken` is what turns that into the same kind of session
  /// `verifyCode` produces.
  Future<void> signInWithGoogle() async {
    try {
      // GoogleSignIn caches the account in-process on its first success —
      // its own doc comment says signIn() only re-triggers native UI once
      // there is no currentUser, otherwise it silently hands back the same
      // account. Without this, the picker would appear exactly once per app
      // install and every tap after that would sign back in as whoever
      // used it first, with no way to choose someone else short of killing
      // the app. Signing out here first costs nothing when there is no
      // cached account, and guarantees a chooser every time there is one.
      await _googleSignIn.signOut();

      final account = await _googleSignIn.signIn();
      if (account == null) return; // The picker was dismissed — not an error.

      final tokens = await account.authentication;
      final idToken = tokens.idToken;
      if (idToken == null) {
        throw const ApiException(
            "Google didn't return what we needed. Try again, or use email.");
      }

      await supabase.auth.signInWithIdToken(
        provider: OAuthProvider.google,
        idToken: idToken,
        accessToken: tokens.accessToken,
      );
    } on ApiException {
      rethrow;
    } on AuthException catch (e) {
      throw ApiException(e.message);
    } catch (_) {
      throw const ApiException(
          "Couldn't sign in with Google. Check your connection and try "
          'again.');
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

  /// Change the address, which changes the login.
  ///
  /// Supabase emails the new address to confirm it and the old one keeps
  /// working until they do, so nothing here has happened yet when this
  /// returns — which is why the screen says so rather than showing the new
  /// address as if it were already theirs.
  Future<void> changeEmail(String email) async {
    try {
      await supabase.auth.updateUser(UserAttributes(email: email.trim()));
    } on AuthException catch (e) {
      throw ApiException(e.message);
    } catch (_) {
      throw const ApiException(
          "Couldn't send the confirmation. Check your connection and try "
          'again.');
    }
  }

  /// Also clears the cached Google account, if any — belt and braces
  /// alongside the signOut() in `signInWithGoogle()`. Swallowed rather than
  /// awaited-and-thrown: someone who has only ever used email OTP has no
  /// Google session to clear, and a plugin hiccup here must never block an
  /// otherwise-ordinary sign-out.
  Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
    } catch (_) {
      // Nothing to clear, or the plugin failed to clear it — either way,
      // the Supabase sign-out below is what actually matters.
    }
    await supabase.auth.signOut();
  }
}
