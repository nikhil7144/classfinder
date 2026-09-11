import 'package:aspire91/src/data/models/entry.dart';
import 'package:aspire91/src/data/models/event.dart';
import 'package:flutter_test/flutter_test.dart';

/// The parts of events that are decisions rather than plumbing.
///
/// Two of them would be caught only by a constraint violation from the
/// database, which is a bad way to find out: the team_size rule, and sending a
/// booking URL for an event that does not use one.

void main() {
  group('a category on the way out', () {
    test('sends a team size only for a team', () {
      // The database has a check constraint on this pair. Leaving a size
      // behind after switching to individual is exactly what it refuses.
      final team = EventCategory(
        name: 'Under-14 Relay',
        entryType: 'team',
        teamSize: '4',
      );
      expect(team.toJson()['teamSize'], 4);

      final solo = EventCategory(
        name: 'Under-10 Singles',
        entryType: 'individual',
        teamSize: '4',
      );
      expect(solo.toJson().containsKey('teamSize'), isFalse);
    });

    test('omits an empty optional rather than sending null', () {
      final c = EventCategory(name: 'Open');
      final json = c.toJson();
      expect(json.containsKey('capacity'), isFalse);
      expect(json.containsKey('feeAmount'), isFalse);
      expect(json.containsKey('minAge'), isFalse);
      expect(json['name'], 'Open');
    });

    test('keeps its id, which is what keeps its entries', () {
      // A category that loses its id is replaced rather than edited, and
      // everybody who had entered goes with it.
      final existing = EventCategory(id: 'cat-1', name: 'Under-10');
      expect(existing.toJson()['id'], 'cat-1');
      expect(EventCategory(name: 'New').toJson().containsKey('id'), isFalse);
    });

    test('parses numbers back out as the text a form edits', () {
      final c = EventCategory.fromJson(const {
        'id': 'c1',
        'name': 'Under-12',
        'entryType': 'team',
        'teamSize': 4,
        'capacity': 16,
        'entriesCount': 3,
        'feeAmount': 300,
        'minAge': 10,
        'maxAge': 12,
        'sortOrder': 0,
      });

      expect(c.teamSize, '4');
      expect(c.feeAmount, '300');
      expect(c.entriesCount, 3);
      expect(c.isTeam, isTrue);
    });

    test('knows when it is full', () {
      EventCategory withPlaces(String? capacity, int taken) =>
          EventCategory.fromJson({
            'id': 'c1',
            'name': 'x',
            'capacity': capacity == null ? null : int.parse(capacity),
            'entriesCount': taken,
          });

      expect(withPlaces('16', 16).isFull, isTrue);
      expect(withPlaces('16', 15).isFull, isFalse);
      // Uncapped is never full.
      expect(withPlaces(null, 500).isFull, isFalse);
    });
  });

  group('an event on the way out', () {
    Event event() => Event(
          title: 'Under-12 Trials',
          cityId: 'city-1',
          startsAt: DateTime.utc(2026, 10, 12, 9),
        );

    test('sends a booking URL only when entries go elsewhere', () {
      // The validator refuses a string that is not a URL, so an empty one must
      // not be sent — and a platform event has no business carrying one.
      final external = event()
        ..bookingMode = 'external'
        ..externalBookingUrl = 'https://example.test/book';
      expect(external.toSaveJson()['externalBookingUrl'],
          'https://example.test/book');

      final platform = event()
        ..bookingMode = 'platform'
        ..externalBookingUrl = 'https://example.test/book';
      expect(platform.toSaveJson().containsKey('externalBookingUrl'), isFalse);

      final empty = event()
        ..bookingMode = 'external'
        ..externalBookingUrl = '   ';
      expect(empty.toSaveJson().containsKey('externalBookingUrl'), isFalse);
    });

    test('does not send categories with the body', () {
      // They are replaced as a set by their own call. Folding them in would
      // mean fixing a typo in the title rewrote every category row.
      final e = event()..categories = [EventCategory(name: 'Under-10')];
      expect(e.toSaveJson().containsKey('categories'), isFalse);
    });

    test('sends dates as UTC ISO strings', () {
      expect(event().toSaveJson()['startsAt'], '2026-10-12T09:00:00.000Z');
    });

    test('omits the optional moments nobody set', () {
      final json = event().toSaveJson();
      expect(json.containsKey('endsAt'), isFalse);
      expect(json.containsKey('bookingClosesAt'), isFalse);
      expect(json.containsKey('cancellationDeadline'), isFalse);
    });

    test('adds up entries across every category', () {
      final e = event()
        ..categories = [
          EventCategory.fromJson(const {'id': 'a', 'entriesCount': 4}),
          EventCategory.fromJson(const {'id': 'b', 'entriesCount': 7}),
        ];
      expect(e.entriesCount, 11);
    });

    test('only a platform event has a register', () {
      expect((event()..bookingMode = 'platform').takesEntriesHere, isTrue);
      expect((event()..bookingMode = 'external').takesEntriesHere, isFalse);
      expect((event()..bookingMode = 'none').takesEntriesHere, isFalse);
    });

    test('falls back rather than throwing on a status added later', () {
      expect(EventStatus.parse('archived'), EventStatus.draft);
      expect(EventStatus.parse(null), EventStatus.draft);
      expect(EventStatus.parse('published'), EventStatus.published);
      expect(EventStatus.published.isLive, isTrue);
      expect(EventStatus.draft.isLive, isFalse);
    });
  });

  group('an entry on the register', () {
    Entry entry(
            {String? dob,
            String status = 'confirmed',
            String pay = 'unpaid'}) =>
        Entry.fromJson({
          'id': 'e1',
          'eventId': 'ev1',
          'categoryId': 'c1',
          'categoryName': 'Under-12',
          'participantName': 'Nivaan',
          'participantDob': dob,
          'status': status,
          'paymentStatus': pay,
          'amountDue': 300,
          'receiptNo': 'A91-0007',
          'enteredAt': '2026-09-03T10:00:00.000Z',
        });

    test('ages a child at the event, not today', () {
      // An age-banded category is about the day of the event. Using today
      // would let an under-12 who turns 12 the week before slip through.
      final e = entry(dob: '2014-10-20T00:00:00.000Z');
      expect(e.ageAt(DateTime.utc(2026, 10, 12)), 11); // birthday not yet
      expect(e.ageAt(DateTime.utc(2026, 10, 21)), 12); // birthday passed
    });

    test('handles a birthday on the day itself', () {
      final e = entry(dob: '2014-10-12T00:00:00.000Z');
      expect(e.ageAt(DateTime.utc(2026, 10, 12)), 12);
    });

    test('has no age when the date of birth was not given', () {
      expect(entry().ageAt(DateTime.utc(2026, 10, 12)), isNull);
      expect(entry(dob: '2014-10-12T00:00:00.000Z').ageAt(null), isNull);
    });

    test('counts waived as paid, because nothing is owed either way', () {
      expect(entry(pay: 'paid').isPaid, isTrue);
      expect(entry(pay: 'waived').isPaid, isTrue);
      expect(entry(pay: 'unpaid').isPaid, isFalse);
      expect(entry(pay: 'refund_due').isPaid, isFalse);
    });

    test('knows it was withdrawn', () {
      expect(entry(status: 'cancelled').isCancelled, isTrue);
      expect(entry().isCancelled, isFalse);
    });

    test('is a team only when it has members', () {
      expect(entry().isTeam, isFalse);
      final team = Entry.fromJson({
        'id': 'e2',
        'participantName': 'Relay A',
        'receiptNo': 'A91-0008',
        'enteredAt': '2026-09-03T10:00:00.000Z',
        'members': [
          {'id': 'm1', 'name': 'Nivaan', 'sortOrder': 0},
          {'id': 'm2', 'name': 'Aarav', 'sortOrder': 1},
        ],
      });
      expect(team.isTeam, isTrue);
      expect(team.members.length, 2);
    });
  });
}
