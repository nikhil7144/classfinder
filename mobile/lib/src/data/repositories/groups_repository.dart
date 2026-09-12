import '../api.dart';
import '../models/group.dart';

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
}
