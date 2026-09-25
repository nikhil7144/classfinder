import 'package:aspire91/src/data/models/thread.dart';
import 'package:flutter_test/flutter_test.dart';

/// Which conversations can still take a message — the one rule the 2026-09-18
/// bug report turned on. Ported from the web's threadIsOpen(): a group thread
/// once accepted, an enquiry once open. Getting this wrong either way is a
/// real bug — too strict blocks a live conversation, too loose lets someone
/// type into a thread the service has already closed and surfaces its refusal
/// as a raw RLS error, which is exactly what shipped once already.
Map<String, dynamic> row({required String kind, required String status}) => {
      'kind': kind,
      'threadId': 't1',
      'groupId': kind == 'group' ? 'g1' : null,
      'providerId': 'p1',
      'title': 'Nivaan',
      'subtitle': 'Boxing · Indirapuram',
      'photoUrl': null,
      'opening': 'Hi Sir, We are looking for a boxing coach.',
      'status': status,
      'initiatedBy': 'seeker',
      'createdAt': '2026-09-01T16:57:20.000Z',
      'lastMessage': 'hi',
      'lastMessageAt': '2026-09-01T17:27:11.000Z',
      'lastSenderId': 's1',
      'messageCount': 4,
      'unread': false,
      'iAmSeeker': false,
      'showPhone': true,
      'origin': null,
    };

void main() {
  group('Thread.isOpen', () {
    test('an enquiry is open only when its status says open', () {
      expect(Thread.fromJson(row(kind: 'enquiry', status: 'open')).isOpen,
          isTrue);
      expect(Thread.fromJson(row(kind: 'enquiry', status: 'pending')).isOpen,
          isFalse);
      expect(Thread.fromJson(row(kind: 'enquiry', status: 'declined')).isOpen,
          isFalse);
    });

    test('a group thread is open only once accepted', () {
      expect(Thread.fromJson(row(kind: 'group', status: 'accepted')).isOpen,
          isTrue);
      // 'open' is an enquiry status, not a group one — a group thread must
      // not read as open just because the string matches.
      expect(
          Thread.fromJson(row(kind: 'group', status: 'open')).isOpen, isFalse);
      expect(Thread.fromJson(row(kind: 'group', status: 'pending')).isOpen,
          isFalse);
      expect(Thread.fromJson(row(kind: 'group', status: 'declined')).isOpen,
          isFalse);
    });

    test('declined is not open and not awaiting a reply either', () {
      final t = Thread.fromJson(row(kind: 'enquiry', status: 'declined'));
      expect(t.isOpen, isFalse);
      expect(t.awaitingReply, isFalse);
    });
  });
}
