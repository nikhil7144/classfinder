import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../api_exception.dart';
import '../models/listing.dart';
import '../supabase.dart';

/// The coach's own listing: read it, save it, and put a face on it.
///
/// The read and the write go through the API. `GET /providers/me` answers the
/// owner's own rows rather than the public profile — the public one comes from
/// get_provider_profile(), which is null while a listing is unapproved, so a
/// new coach could never load the form that makes it approvable.
///
/// The photo does not go through the API. Bytes to Storage is the second of
/// the two doors PLAN.md keeps open, and forwarding a few megabytes through a
/// Node process to hand it to the same bucket helps nobody.
class ListingRepository {
  const ListingRepository(this._api);

  final ApiClient _api;

  /// The listing, or null for a coach who has not started one.
  ///
  /// 404 is that case and not an error: the account exists from the moment a
  /// role is chosen, and the provider row is written by the first save.
  Future<Listing?> mine() async {
    try {
      final json = await _api.get('/api/v1/providers/me');
      return Listing.fromJson(json as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  /// The whole listing, in one call and one transaction.
  ///
  /// Not a patch. save_provider_profile() replaces branches and service areas
  /// wholesale, and the web learned the hard way what a half-applied save
  /// costs: the delete ran before the insert, so a failure between them left a
  /// coach discoverable nowhere and told them it had saved.
  Future<Listing> save(Listing listing) async {
    final json = await _api.put(
      '/api/v1/providers/me',
      body: listing.toSaveJson(),
    );
    return Listing.fromJson(json as Map<String, dynamic>);
  }

  /// Upload a profile photo and return the URL to save on the listing.
  ///
  /// One object per coach, overwritten — `<user id>/profile.<ext>`, the same
  /// path the web writes, so a coach who signed up in a browser and then
  /// installed the app replaces their photo rather than accumulating them.
  ///
  /// The cache-busting suffix matters: the path never changes, so without it
  /// every client that has seen the old photo keeps showing it.
  Future<String> uploadPhoto(File file, {required String userId}) async {
    final ext = file.path.split('.').last.toLowerCase();
    final path = '$userId/profile.${ext.isEmpty ? 'jpg' : ext}';

    try {
      await supabase.storage.from('provider-photos').upload(
            path,
            file,
            fileOptions: const FileOptions(upsert: true),
          );
    } on StorageException catch (e) {
      // Storage speaks its own error shape, and the screens only know
      // ApiException. Translate here rather than teaching every screen both.
      throw ApiException('That photo could not be uploaded. ${e.message}');
    }

    final url = supabase.storage.from('provider-photos').getPublicUrl(path);
    return '$url?v=${DateTime.now().millisecondsSinceEpoch}';
  }
}
