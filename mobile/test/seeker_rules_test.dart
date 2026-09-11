import 'package:aspire91/src/data/models/seeker.dart';
import 'package:aspire91/src/data/seeker_rules.dart';
import 'package:flutter_test/flutter_test.dart';

/// What makes a family's profile complete.
///
/// A port of getSeekerProfileFieldErrors and getRequirementErrors, pinned for
/// the same reason listing_rules_test is: a parent who completes a profile in
/// the app and opens it on the web must not be told it is unfinished.

/// A profile with nothing missing, to take things away from.
SeekerProfile complete() => SeekerProfile(
      name: 'Nikhil Gupta',
      relationToLearner: 'father',
      areaId: 'area-1',
      lookingFor: const ['svc-1'],
    );

Set<String> messages(SeekerProfile p, {String? phone = '9876543210'}) =>
    seekerProblems(p, phone: phone).map((e) => e.message).toSet();

void main() {
  test('a filled-in profile has nothing wrong with it', () {
    expect(seekerProblems(complete(), phone: '9876543210'), isEmpty);
  });

  group('who you are', () {
    test('needs a name', () {
      expect(messages(complete()..name = '  '),
          contains('Your name is required.'));
    });

    test('needs an area, which is what search is centred on', () {
      expect(messages(complete()..areaId = null),
          contains("Choose the area you're looking in."));
    });

    test('needs to know who they are looking for', () {
      expect(messages(complete()..relationToLearner = null),
          contains("Tell us who you're looking for."));
    });

    test('takes the phone from the profile, not the seeker row', () {
      // It is saved by a different call, so it is easy to forget. If it is not
      // checked here nothing checks it.
      expect(messages(complete(), phone: null),
          contains('A mobile number is required.'));
      expect(messages(complete(), phone: '   '),
          contains('A mobile number is required.'));
    });
  });

  group('what you want', () {
    test('is required of somebody who has asked to be found', () {
      final p = complete()
        ..openToOffers = true
        ..lookingFor = [];
      expect(
          messages(p), contains("Pick at least one thing you're looking for."));
    });

    test('is not required of somebody who only wants to browse', () {
      // The rule most easily got backwards. The web's comment: "a parent who
      // just wants to browse and message owes us nothing."
      final p = complete()
        ..openToOffers = false
        ..lookingFor = [];
      expect(seekerProblems(p, phone: '9876543210'), isEmpty);
    });

    test('still checks the rest even when nothing is required', () {
      // Optional does not mean unvalidated: a budget of "abc" is wrong either
      // way.
      final p = complete()
        ..openToOffers = false
        ..lookingFor = []
        ..learnerAge = '150';
      expect(messages(p), contains('Enter an age between 2 and 99.'));
    });
  });

  group('the learner age', () {
    test('is optional', () {
      expect(seekerProblems(complete()..learnerAge = '', phone: '98'), isEmpty);
    });

    test('has to be a real age', () {
      for (final age in ['1', '100', 'nine']) {
        expect(messages(complete()..learnerAge = age),
            contains('Enter an age between 2 and 99.'),
            reason: age);
      }
    });

    test('accepts the edges', () {
      expect(
          seekerProblems(complete()..learnerAge = '2', phone: '98'), isEmpty);
      expect(
          seekerProblems(complete()..learnerAge = '99', phone: '98'), isEmpty);
    });
  });

  group('the budget', () {
    test('is optional as a whole', () {
      expect(seekerProblems(complete(), phone: '9876543210'), isEmpty);
    });

    test('needs a period once a number is given', () {
      expect(messages(complete()..budgetMin = '1500'),
          contains('Choose what the budget is per.'));
    });

    test('refuses an upper below the lower', () {
      final p = complete()
        ..budgetMin = '3000'
        ..budgetMax = '1500'
        ..budgetPeriod = 'per_month';
      expect(messages(p),
          contains("The upper budget can't be lower than the lower one."));
    });

    test('accepts a range in the right order', () {
      final p = complete()
        ..budgetMin = '1500'
        ..budgetMax = '3000'
        ..budgetPeriod = 'per_month';
      expect(seekerProblems(p, phone: '9876543210'), isEmpty);
    });

    test('refuses something that is not a number', () {
      expect(messages(complete()..budgetMin = 'a lot'),
          contains('Budget must be a number.'));
    });
  });

  group('what gets sent', () {
    test('leaves the phone out — it is saved by another call', () {
      expect(complete().toSaveJson().containsKey('phone'), isFalse);
    });

    test('parses numbers once, on save', () {
      final p = complete()
        ..learnerAge = '9'
        ..budgetMin = '1500'
        ..budgetPeriod = 'per_month';

      final json = p.toSaveJson();
      expect(json['learnerAge'], 9);
      expect(json['budgetMin'], 1500);
    });

    test('omits an empty optional rather than sending an empty string', () {
      final json = (complete()..requirementNotes = '   ').toSaveJson();
      expect(json.containsKey('requirementNotes'), isFalse);
    });

    test('always sends both consent switches, including when they are off', () {
      // removeWhere drops nulls, not falses — and a marketing switch that
      // silently vanished when turned off would read as never answered.
      final json = (complete()
            ..openToOffers = false
            ..marketingOptIn = false)
          .toSaveJson();

      expect(json['openToOffers'], false);
      expect(json['marketingOptIn'], false);
    });

    test('sends a location only when one was given', () {
      expect(complete().toSaveJson().containsKey('lat'), isFalse);

      final located = complete()
        ..lat = 22.7
        ..lng = 75.9;
      expect(located.toSaveJson()['lat'], 22.7);
    });
  });

  test('a blank profile defaults to found, and not marketed at', () {
    final blank = SeekerProfile();
    expect(blank.openToOffers, isTrue);
    expect(blank.marketingOptIn, isFalse);
    expect(blank.hasRequirement, isFalse);
  });
}
