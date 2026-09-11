import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../api_exception.dart';
import '../models/seeker.dart';
import '../supabase.dart';

/// A family's own profile.
///
/// The mirror of ListingRepository, and it has the same split: the profile
/// goes through the API, the photo goes straight to Storage, and the phone
/// number is neither — it lives on `profiles` and is saved by MeRepository.
class SeekerRepository {
  const SeekerRepository(this._api);

  final ApiClient _api;

  /// The profile, or null for a family who has not started one.
  ///
  /// 404 is that state and not an error: the account exists from the moment a
  /// role is chosen, and the row is written by the first save.
  Future<SeekerProfile?> mine() async {
    try {
      final json = await _api.get('/api/v1/seekers/me');
      return SeekerProfile.fromJson(json as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  /// The whole profile, in one call.
  ///
  /// Not a patch: the row is upserted, so a partial payload would clear what
  /// it omitted.
  Future<SeekerProfile> save(SeekerProfile profile) async {
    final json = await _api.put(
      '/api/v1/seekers/me',
      body: profile.toSaveJson(),
    );
    return SeekerProfile.fromJson(json as Map<String, dynamic>);
  }

  /// One object per family, overwritten — the same path the web writes, so a
  /// parent who signed up in a browser replaces their photo rather than
  /// accumulating them.
  Future<String> uploadPhoto(File file, {required String userId}) async {
    final ext = file.path.split('.').last.toLowerCase();
    final path = '$userId/profile.${ext.isEmpty ? 'jpg' : ext}';

    try {
      await supabase.storage.from('seeker-photos').upload(
            path,
            file,
            fileOptions: const FileOptions(upsert: true),
          );
    } on StorageException catch (e) {
      throw ApiException('That photo could not be uploaded. ${e.message}');
    }

    // The path never changes, so without a cache-buster every client that has
    // seen the old photo keeps showing it.
    final url = supabase.storage.from('seeker-photos').getPublicUrl(path);
    return '$url?v=${DateTime.now().millisecondsSinceEpoch}';
  }
}
