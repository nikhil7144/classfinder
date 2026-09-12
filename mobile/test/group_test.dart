import 'package:aspire91/src/data/models/group.dart';
import 'package:flutter_test/flutter_test.dart';

/// The states a group can be in, and how they are said.
///
/// Three of them stop coaches seeing it, and they are different problems with
/// different answers — closed is a decision, expired is a deadline, and short
/// of families is a thing a neighbour can fix. A group that is quietly
/// invisible is the worst state to be in, so the reason has to be right.

Group aGroup({
  int memberCount = 3,
  bool isActive = true,
  String? closedAt,
  Duration expiresIn = const Duration(days: 5),
  bool isCreator = true,
  int pendingRequests = 0,
}) =>
    Group.fromJson({
      'id': 'g1',
      'serviceName': 'Kathak',
      'areaName': 'Vijay Nagar',
      'cityName': 'Indore',
      'societyName': 'Shipra Sun City',
      'studentCount': 4,
      // bigint over PostgREST.
      'memberCount': '$memberCount',
      'expiresAt': DateTime.now().add(expiresIn).toUtc().toIso8601String(),
      'closedAt': closedAt,
      'isCreator': isCreator,
      'isActive': isActive,
      'pendingRequests': '$pendingRequests',
      'createdAt': '2026-09-12T10:00:00.000Z',
    });

void main() {
  group('why coaches cannot see it', () {
    test('nothing is wrong with a live one', () {
      expect(aGroup().dormantReason, isNull);
    });

    test('closed is a decision, and says so first', () {
      // Closed beats expired in the message: a creator who closed it does not
      // need telling the clock also ran out.
      final g = aGroup(
        closedAt: '2026-09-12T10:00:00.000Z',
        expiresIn: const Duration(days: -3),
        isActive: false,
      );
      expect(g.dormantReason, 'You closed it');
    });

    test('expired is a deadline', () {
      final g = aGroup(expiresIn: const Duration(days: -1), isActive: false);
      expect(g.dormantReason, 'It has run out');
    });

    test('too few families is something a neighbour can fix', () {
      // Open, unexpired, and still not visible — the one case where the answer
      // is to send somebody the link.
      final g = aGroup(memberCount: 1, isActive: false);
      expect(g.dormantReason, 'Waiting for more families');
    });
  });

  group('how long is left', () {
    // Calendar days, not a duration. inDays truncates, so five days minus the
    // microseconds since the clock was read used to come out as four.

    test('counts whole days', () {
      expect(
          aGroup(expiresIn: const Duration(days: 5)).remaining, '5 days left');
    });

    test('is singular at one', () {
      expect(
        aGroup(expiresIn: const Duration(days: 1, hours: 1)).remaining,
        '1 day left',
      );
    });

    test('says today rather than zero days', () {
      expect(
          aGroup(expiresIn: const Duration(hours: 5)).remaining, 'Ends today');
    });

    test('says ended once it has', () {
      expect(aGroup(expiresIn: const Duration(days: -1)).remaining, 'Ended');
    });

    test("counts in the reader's timezone, not UTC", () {
      // Half past midnight tomorrow, local. East of Greenwich that instant is
      // still *today* in UTC, so a group expiring then used to read "Ends
      // today" — for every user in India, every night between midnight and
      // half past five. The expiry has to be converted before its date is
      // taken. West of Greenwich, and in UTC itself, this is simply one day
      // out either way, which is what it should say.
      final now = DateTime.now();
      final tomorrow = DateTime(now.year, now.month, now.day)
          .add(const Duration(days: 1, minutes: 30));

      final g = Group.fromJson({
        'id': 'g1',
        'memberCount': '3',
        'expiresAt': tomorrow.toUtc().toIso8601String(),
        'isCreator': true,
        'isActive': true,
        'pendingRequests': '0',
        'createdAt': '2026-09-12T10:00:00.000Z',
      });

      expect(g.remaining, '1 day left');
    });
  });

  group('reading a group off the wire', () {
    test('coerces the bigints PostgREST sends as strings', () {
      final g = aGroup(memberCount: 3, pendingRequests: 2);
      expect(g.memberCount, 3);
      expect(g.pendingRequests, 2);
      expect(g.memberCount, isA<int>());
    });

    test('knows whether it is closed', () {
      expect(aGroup().isClosed, isFalse);
      expect(aGroup(closedAt: '2026-09-12T10:00:00.000Z').isClosed, isTrue);
    });
  });

  group('an invite', () {
    test('carries the notes a member list does not', () {
      // Readable by somebody not in the group yet, so it says what the group
      // wants and nothing about who is in it.
      final invite = GroupInvite.fromJson({
        'id': 'g1',
        'serviceName': 'Kathak',
        'areaName': 'Vijay Nagar',
        'cityName': 'Indore',
        'societyName': 'Shipra Sun City',
        'studentCount': 4,
        'notes': 'Saturday mornings would suit us.',
        'memberCount': 3,
        'expiresAt': '2026-09-22T10:00:00.000Z',
        'isOpen': true,
        'alreadyMember': false,
      });

      expect(invite.notes, 'Saturday mornings would suit us.');
      expect(invite.isOpen, isTrue);
      expect(invite.alreadyMember, isFalse);
    });

    test('says false rather than failing for a guest', () {
      final invite = GroupInvite.fromJson({
        'id': 'g1',
        'expiresAt': '2026-09-22T10:00:00.000Z',
      });
      expect(invite.alreadyMember, isFalse);
      expect(invite.isOpen, isFalse);
    });
  });

  group('a pitch', () {
    test('starts waiting on the creator', () {
      final pitch = GroupPitch.fromJson({
        'requestId': 'r1',
        'providerId': 'p1',
        'providerName': 'Krishna',
        'pitch': 'We can take four children on Saturdays.',
        'status': 'pending',
        'createdAt': '2026-09-12T10:00:00.000Z',
        'messageCount': '0',
        'unread': true,
        'isCreator': true,
      });

      expect(pitch.status, PitchStatus.pending);
      expect(pitch.status.label, 'Waiting on you');
      expect(pitch.messageCount, 0);
      expect(pitch.isCreator, isTrue);
    });

    test('falls back rather than throwing on a status added later', () {
      expect(PitchStatus.parse('withdrawn'), PitchStatus.pending);
      expect(PitchStatus.parse(null), PitchStatus.pending);
      expect(PitchStatus.parse('accepted'), PitchStatus.accepted);
    });
  });

  test('the contact strip says which kind of null a missing number is', () {
    // Withheld and not-on-file look the same without it.
    final withheld = GroupContact.fromJson(
      const {'phone': null, 'name': 'Asha', 'shared': false},
    );
    expect(withheld.phone, isNull);
    expect(withheld.shared, isFalse);

    final shared = GroupContact.fromJson(
      const {'phone': '9876543210', 'name': 'Asha', 'shared': true},
    );
    expect(shared.phone, '9876543210');
    expect(shared.shared, isTrue);
  });

  test('two families is the floor, and it is stated once', () {
    // One on its own is an enquiry. The form, the API and the database all
    // agree, and this is where the app says it.
    expect(groupMinStudents, 2);
  });
}
