import 'package:aspire91/src/data/entry_rules.dart';
import 'package:flutter_test/flutter_test.dart';

/// The rules around the one form in this product that takes a child's name and
/// date of birth.
///
/// Two of these are worth more than they look. The consent check is what the
/// service refuses an entry without, so a client that lets it through sends
/// somebody's child to an organiser on a technicality. And the date sent for a
/// birthday carries no time, because an offset of a few hours either way moves
/// a ten-year-old into the under-10s or out of them.

void main() {
  group('the age band, as the reader sees it', () {
    test('reads a range both ways round', () {
      expect(formatAges('12', '14'), 'Ages 12–14');
    });

    test('says under the year above the top, which is what a cap means', () {
      // A category capped at 9 is the under-10s. Printing "Under 9" would send
      // nine-year-olds away from an event they are eligible for.
      expect(formatAges('', '9'), 'Under 10');
    });

    test('says and over with only a floor', () {
      expect(formatAges('16', ''), '16 and over');
    });

    test('says nothing at all when it is open to everybody', () {
      expect(formatAges('', ''), isNull);
    });
  });

  group('how full it is', () {
    test('counts up to the cap', () {
      expect(formatCapacity('40', 12), '12 of 40 taken');
    });

    test('is full at the cap, not one past it', () {
      expect(formatCapacity('40', 40), 'Full');
      expect(formatCapacity('40', 41), 'Full');
    });

    test('an uncapped category is open, or says how many came', () {
      expect(formatCapacity('', 0), 'Open entry');
      expect(formatCapacity('', 7), '7 entered');
    });
  });

  group('what stops an entry going', () {
    test('a name is asked for first', () {
      expect(
        entryProblem(participantName: ' ', memberNames: [], consent: true),
        'Who is taking part?',
      );
    });

    test('one letter is not a name', () {
      expect(
        entryProblem(participantName: 'A', memberNames: [], consent: true),
        isNotNull,
      );
    });

    test('every player in a team needs one', () {
      expect(
        entryProblem(
          participantName: 'Aarav Sharma',
          memberNames: ['Riya Nair', '  '],
          consent: true,
        ),
        'Every player in the team needs a name.',
      );
    });

    test('consent is what stands between a filled form and an entry', () {
      expect(
        entryProblem(
          participantName: 'Aarav Sharma',
          memberNames: const [],
          consent: false,
        ),
        'Please confirm the line above before entering.',
      );
    });

    test('consent alone is never enough', () {
      // The order matters: an empty form with the box ticked must still be
      // told about the name, not waved through.
      expect(
        entryProblem(participantName: '', memberNames: [], consent: true),
        'Who is taking part?',
      );
    });

    test('nothing left to fix', () {
      expect(
        entryProblem(
          participantName: 'Aarav Sharma',
          memberNames: ['Riya Nair'],
          consent: true,
        ),
        isNull,
      );
    });
  });

  group('how many more names a team asks for', () {
    test('the entrant is one of the four', () {
      expect(teamMatesNeeded(isTeam: true, teamSize: '4'), 3);
    });

    test('an individual asks for none', () {
      expect(teamMatesNeeded(isTeam: false, teamSize: '4'), 0);
    });

    test('a team with no size set asks for none rather than minus one', () {
      expect(teamMatesNeeded(isTeam: true, teamSize: ''), 0);
      expect(teamMatesNeeded(isTeam: true, teamSize: '1'), 0);
    });
  });

  group('the date of birth on the wire', () {
    test('carries no time and no offset', () {
      expect(isoDate(DateTime(2016, 3, 7)), '2016-03-07');
    });

    test('pads the parts, because the service parses a fixed shape', () {
      expect(isoDate(DateTime(2016, 12, 31)), '2016-12-31');
      expect(isoDate(DateTime(999, 1, 1)), '0999-01-01');
    });

    test('a birthday late in the evening stays on its own day', () {
      // Late-evening local time is the next day in UTC. Sending an instant
      // instead of a date is how a child changes age band in transit.
      expect(isoDate(DateTime(2016, 3, 7, 23, 45)), '2016-03-07');
    });
  });
}
