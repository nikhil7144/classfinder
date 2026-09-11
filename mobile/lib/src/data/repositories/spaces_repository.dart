import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../api_exception.dart';
import '../models/space.dart';
import '../supabase.dart';

/// A coach's Space: the page, its posts, and posting to it.
///
/// Everything goes through the API except the image bytes, which go straight
/// to the `space-media` bucket — the second door PLAN.md keeps open. The API
/// then takes the public URL.
///
/// Reaction counts come from the service and are not computed here: RLS makes
/// `space_reactions` readable only for your own rows, so a client counting
/// them would report one every time.
class SpacesRepository {
  const SpacesRepository(this._api);

  final ApiClient _api;

  /// One Space. Readable signed out, and a suspended one is a 404 to everybody
  /// but its owner.
  Future<Space> one(String providerId) async {
    final json = await _api.get('/api/v1/spaces/$providerId');
    return Space.fromJson(json as Map<String, dynamic>);
  }

  /// Newest first, so `before` pages backwards.
  Future<List<SpacePost>> posts(
    String providerId, {
    DateTime? before,
    int? limit,
  }) async {
    final json = await _api.get(
      '/api/v1/spaces/$providerId/posts',
      query: {
        'before': before?.toUtc().toIso8601String(),
        'limit': limit,
      },
    );
    return (json as List)
        .map((e) => SpacePost.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<SpacePost> createPost(
    String providerId, {
    required String kind,
    String? body,
    String? imageUrl,
    String? youtubeId,
  }) async {
    final json = await _api.post(
      '/api/v1/spaces/$providerId/posts',
      body: {
        'kind': kind,
        if (body != null && body.trim().isNotEmpty) 'body': body.trim(),
        if (imageUrl != null) 'imageUrl': imageUrl,
        if (youtubeId != null) 'youtubeId': youtubeId,
      },
    );
    return SpacePost.fromJson(json as Map<String, dynamic>);
  }

  Future<void> deletePost(String postId) =>
      _api.delete('/api/v1/spaces/posts/$postId');

  /// Set or clear this viewer's reaction. Null clears it.
  Future<void> setReaction(String postId, Reaction? reaction) => _api.put(
        '/api/v1/spaces/posts/$postId/reaction',
        body: {'reaction': reaction?.id},
      );

  Future<Space> setFollowing(String providerId, bool follow) async {
    final json = follow
        ? await _api.put('/api/v1/spaces/$providerId/follow')
        : await _api.delete('/api/v1/spaces/$providerId/follow');
    return Space.fromJson(json as Map<String, dynamic>);
  }

  /// Upload a photo for a post and return the URL to send with it.
  ///
  /// Keyed on the space id with a fresh name each time — the same convention
  /// the web writes, and unlike the profile photo these accumulate rather than
  /// overwrite, because a post is not a slot.
  Future<String> uploadImage(File file, {required String spaceId}) async {
    final length = await file.length();
    if (length > maxImageBytes) {
      // Checked here rather than left to Storage: a coach on mobile data
      // should not send five megabytes to be told no at the end of it.
      throw const ApiException('That photo is over 5 MB. Try a smaller one.');
    }

    final ext = file.path.split('.').last.toLowerCase();
    final name = DateTime.now().microsecondsSinceEpoch.toString();
    final path = '$spaceId/$name.${ext.isEmpty ? 'jpg' : ext}';

    try {
      await supabase.storage.from('space-media').upload(path, file);
    } on StorageException catch (e) {
      throw ApiException('That photo could not be uploaded. ${e.message}');
    }

    return supabase.storage.from('space-media').getPublicUrl(path);
  }
}
