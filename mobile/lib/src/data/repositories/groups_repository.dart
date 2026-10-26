import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../api.dart';
import '../api_exception.dart';
import '../models/group.dart';
import '../models/space.dart';
import '../supabase.dart';

/// Groups — neighbours asking for the same thing together.
///
/// The family's side only. Pitching *to* a group is the coach's direction and
/// goes through StudentsRepository: phase2r folded groups and lone families
/// into one demand feed, and splitting them again here would undo that.
class GroupsRepository {
  const GroupsRepository(this._api);

  final ApiClient _api;

  /// Every group the caller is in, made or joined.
  Future<List<Group>> mine() async {
    final json = await _api.get('/api/v1/groups');
    return (json as List)
        .map((e) => Group.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// One group as an invite link shows it. Readable signed out.
  Future<GroupInvite> invite(String id) async {
    final json = await _api.get('/api/v1/groups/$id/invite');
    return GroupInvite.fromJson(json as Map<String, dynamic>);
  }

  /// Start one. The creator becomes its first member in the same call.
  Future<Group> create({
    required String serviceCategoryId,
    required String areaId,
    required String societyName,
    String? notes,
    int studentCount = groupMinStudents,
    bool sharePhone = false,
    int validityDays = 10,
  }) async {
    final json = await _api.post('/api/v1/groups', body: {
      'serviceCategoryId': serviceCategoryId,
      'areaId': areaId,
      'societyName': societyName.trim(),
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      'studentCount': studentCount,
      'sharePhone': sharePhone,
      'validityDays': validityDays,
    });
    return Group.fromJson(json as Map<String, dynamic>);
  }

  /// Edit, close, reopen, or give it longer.
  ///
  /// Reopening a group that has already lapsed pushes the expiry out too —
  /// clearing closed_at alone would leave something that says it is open and
  /// that no coach can pitch to. The service handles that; a client just says
  /// which it meant.
  Future<Group> update(
    String id, {
    String? societyName,
    String? notes,
    int? studentCount,
    bool? sharePhone,
    bool? closed,
    bool? extend,
  }) async {
    final json = await _api.patch('/api/v1/groups/$id', body: {
      if (societyName != null) 'societyName': societyName.trim(),
      if (notes != null) 'notes': notes.trim(),
      if (studentCount != null) 'studentCount': studentCount,
      if (sharePhone != null) 'sharePhone': sharePhone,
      if (closed != null) 'closed': closed,
      if (extend != null) 'extend': extend,
    });
    return Group.fromJson(json as Map<String, dynamic>);
  }

  /// Join one. Joining twice is joining once.
  Future<Group> join(String id) async {
    final json = await _api.post('/api/v1/groups/$id/members');
    return Group.fromJson(json as Map<String, dynamic>);
  }

  /// Leave one. The creator cannot — the pitches, the threads and the invite
  /// all hang off them, so they close it instead.
  Future<void> leave(String id) => _api.delete('/api/v1/groups/$id/members/me');

  /// The coaches who have pitched.
  Future<List<GroupPitch>> pitches(String id) async {
    final json = await _api.get('/api/v1/groups/$id/pitches');
    return (json as List)
        .map((e) => GroupPitch.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Accept or decline one. The creator's decision alone.
  Future<void> respondToPitch(String requestId, {required bool accept}) =>
      _api.post(
        '/api/v1/groups/pitches/$requestId/respond',
        body: {'status': accept ? 'accepted' : 'declined'},
      );

  Future<GroupContact> pitchContact(String requestId) async {
    final json = await _api.get('/api/v1/groups/pitches/$requestId/contact');
    return GroupContact.fromJson(json as Map<String, dynamic>);
  }

  /// What the group has posted. Members see every non-hidden post; anybody
  /// else sees only what an author opened, and only while published.
  Future<List<GroupPost>> posts(String groupId) async {
    final json = await _api.get('/api/v1/groups/$groupId/posts');
    return (json as List)
        .map((e) => GroupPost.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Post a photo. Starts at `members` always — the API refuses a visibility
  /// on create, so this never sends one.
  Future<GroupPost> addPost(String groupId, {String? body, required String imageUrl}) async {
    final json = await _api.post('/api/v1/groups/$groupId/posts', body: {
      'kind': 'photo',
      if (body != null && body.trim().isNotEmpty) 'body': body.trim(),
      'imageUrl': imageUrl,
    });
    return GroupPost.fromJson(json as Map<String, dynamic>);
  }

  /// Open a post to the group's public page, or close it again. Only the
  /// author may call this — the API enforces it, this just asks.
  Future<GroupPost> setPostVisibility(String postId, {required bool public}) async {
    final json = await _api.patch(
      '/api/v1/groups/posts/$postId/visibility',
      body: {'visibility': public ? 'public' : 'members'},
    );
    return GroupPost.fromJson(json as Map<String, dynamic>);
  }

  Future<void> deletePost(String postId) =>
      _api.delete('/api/v1/groups/posts/$postId');

  /// Upload a photo for a post and return the URL to send with it.
  ///
  /// Modelled on `SpacesRepository.uploadImage`, with two differences the
  /// bucket's own policies force: the bucket is `group-media`, and the first
  /// folder in the path must be the uploader's own user id — the insert
  /// policy checks only that, so any other first folder fails with a policy
  /// error, not a helpful one.
  Future<String> uploadImage(File file, {required String groupId}) async {
    final length = await file.length();
    if (length > maxImageBytes) {
      throw const ApiException('That photo is over 5 MB. Try a smaller one.');
    }

    final userId = supabase.auth.currentUser?.id;
    if (userId == null) throw const ApiException('Log in again.');

    // The bucket allows only JPEG, PNG, WebP and AVIF. ImagePicker with
    // imageQuality set re-encodes to JPEG on both platforms — including
    // HEIC from an iPhone — so long as the composer always passes it; an
    // extension outside that list here means the picker did not, and jpg is
    // the honest label for what was actually re-encoded.
    const allowed = {'jpg', 'jpeg', 'png', 'webp', 'avif'};
    var ext = file.path.split('.').last.toLowerCase();
    if (!allowed.contains(ext)) ext = 'jpg';
    final name = DateTime.now().microsecondsSinceEpoch.toString();
    final path = '$userId/$groupId/$name.$ext';

    try {
      await supabase.storage.from('group-media').upload(
            path,
            file,
            fileOptions: ext == 'jpg'
                ? const FileOptions(contentType: 'image/jpeg')
                : const FileOptions(),
          );
    } on StorageException catch (e) {
      throw ApiException('That photo could not be uploaded. ${e.message}');
    }

    return supabase.storage.from('group-media').getPublicUrl(path);
  }
}
