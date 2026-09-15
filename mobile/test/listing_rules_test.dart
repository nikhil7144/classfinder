import 'package:aspire91/src/data/listing_rules.dart';
import 'package:aspire91/src/data/models/listing.dart';
import 'package:flutter_test/flutter_test.dart';

/// The completeness rules, which decide whether a coach may publish.
///
/// Worth pinning because they are a port of lib/profile-rules.ts and the two
/// have to agree: a coach who completes a listing in the app and then opens it
/// on the web should not be told it is unfinished.

/// A listing with nothing missing, to take things away from.
Listing complete() => Listing(
      providerType: 'individual',
      providerCategoryId: 'cat-1',
      displayName: 'Asha Rao',
      bio: 'Eleven years of Kathak in Vijay Nagar.',
      helpStatement: 'I get nervous beginners comfortable on stage.',
      experienceYears: '11',
      serviceCategoryIds: ['svc-1'],
      teachingPlaces: ['own_centre'],
      travelsToStudents: false,
      serviceAreaIds: ['area-1'],
      photoUrl: 'https://example.test/a.jpg',
    );

Set<String> messages(Listing l, {String? phone = '9876543210'}) =>
    listingProblems(l, phone: phone).map((p) => p.message).toSet();

void main() {
  test('a filled-in listing has nothing wrong with it', () {
    expect(listingProblems(complete(), phone: '9876543210'), isEmpty);
  });

  test('phone comes from the profile, not the listing', () {
    // It is saved by a different call, so it is easy to forget. If it is not
    // checked here nothing checks it before the coach is marked complete.
    expect(messages(complete(), phone: null),
        contains('A mobile number is required.'));
    expect(messages(complete(), phone: '   '),
        contains('A mobile number is required.'));
  });

  group('an individual', () {
    test('must say whether they travel', () {
      final l = complete()..travelsToStudents = null;
      expect(messages(l), contains('Say whether you travel to students.'));
    });

    test('must serve at least one area, or nobody can find them', () {
      final l = complete()..serviceAreaIds = [];
      expect(messages(l), contains('Select at least one area you serve.'));
    });
  });

  group('an institution', () {
    Listing academy() => complete()
      ..providerType = 'institution'
      ..serviceAreaIds = []
      ..branches = [
        Branch(label: 'Vijay Nagar', address: '12 Scheme 54', areaId: 'area-1'),
      ];

    test('is located by its branches rather than service areas', () {
      expect(listingProblems(academy(), phone: '9876543210'), isEmpty);
    });

    test('needs at least one branch', () {
      final l = academy()..branches = [];
      expect(messages(l), contains('Add at least one branch.'));
    });

    test('needs an area on every branch', () {
      final l = academy()..branches.first.areaId = null;
      expect(messages(l), contains('Every branch needs an area.'));
    });

    test('ignores a blank row, which the form starts with', () {
      final l = academy()..branches.add(Branch());
      expect(listingProblems(l, phone: '9876543210'), isEmpty);
    });

    test('is not asked whether it travels', () {
      final l = academy()..travelsToStudents = null;
      expect(
          messages(l), isNot(contains('Say whether you travel to students.')));
    });
  });

  group('an event planner', () {
    // Never surfaced in coach search, so most of the form does not apply.
    Listing planner() => Listing(
          providerType: 'event_planner',
          displayName: 'Indore Events Co',
          bio: 'We run inter-school competitions.',
          serviceCategoryIds: ['svc-1'],
          serviceAreaIds: ['area-1'],
          photoUrl: 'https://example.test/a.jpg',
        );

    test('needs no category, help statement, experience or teaching places',
        () {
      expect(listingProblems(planner(), phone: '9876543210'), isEmpty);
    });
  });

  group('fees', () {
    test('are optional as a whole', () {
      expect(listingProblems(complete(), phone: '9876543210'), isEmpty);
    });

    test('need a period once a number is given', () {
      final l = complete()..feeMin = '1500';
      expect(messages(l), contains('Choose what the fee is per.'));
    });

    test('refuse an upper bound below the lower one', () {
      final l = complete()
        ..feeMin = '3000'
        ..feeMax = '1500'
        ..feePeriod = 'per_month';
      expect(messages(l),
          contains("The upper fee can't be lower than the starting fee."));
    });

    test('accept a range in the right order', () {
      final l = complete()
        ..feeMin = '1500'
        ..feeMax = '3000'
        ..feePeriod = 'per_month';
      expect(listingProblems(l, phone: '9876543210'), isEmpty);
    });
  });

  group('availability', () {
    test('refuses a slot that ends before it starts', () {
      final l = complete()
        ..availability = [
          AvailabilitySlot(place: 'own_centre', start: '18:00', end: '16:00'),
        ];
      expect(messages(l), contains('A slot must end after it starts.'));
    });

    test('refuses a slot with no place', () {
      final l = complete()..availability = [AvailabilitySlot(place: '')];
      expect(messages(l), contains('Every time slot needs a place.'));
    });

    test('compares zero-padded times as times', () {
      // '9:00' would sort after '10:00' as a string. The pickers pad, so this
      // pins that they have to.
      final l = complete()
        ..availability = [
          AvailabilitySlot(place: 'own_centre', start: '09:00', end: '10:00'),
        ];
      expect(listingProblems(l, phone: '9876543210'), isEmpty);
    });
  });

  // The place list is the thing the app had wrong. It fed `teachingPlaces` —
  // which answers "group or one-to-one" — into a picker whose value is stored
  // as a venue, so the phone wrote a class format into the same column the web
  // fills with a branch name or an area. phase 2U is the migration that split
  // the two questions; these pin the web's availabilityPlaces, case for case.
  group('availability places', () {
    String? areaName(String id) => const {
          'area-1': 'Indirapuram',
          'area-2': 'Vaishali',
        }[id];

    test('an institution is found at its branches', () {
      final l = complete()
        ..providerType = 'institution'
        ..branches = [
          Branch(label: '  Vaishali centre  ', areaId: 'area-1'),
          Branch(label: 'Indirapuram centre', areaId: 'area-2'),
        ];
      expect(
        availabilityPlaces(l, areaName: areaName),
        ['Vaishali centre', 'Indirapuram centre'],
      );
    });

    test('a branch with no name yet is not a place to teach at', () {
      final l = complete()
        ..providerType = 'institution'
        ..branches = [Branch(label: '   ', areaId: 'area-1')];
      expect(availabilityPlaces(l, areaName: areaName), isEmpty);
    });

    test('an individual who teaches at their own place gets it', () {
      final l = complete()
        ..teachingPlaces = ['my_academy', 'individual_classes']
        ..travelsToStudents = false;
      expect(availabilityPlaces(l, areaName: areaName), ['My place']);
    });

    test('a coach who travels gets the areas they travel to', () {
      final l = complete()
        ..teachingPlaces = ['my_academy']
        ..travelsToStudents = true
        ..serviceAreaIds = ['area-1', 'area-2'];
      expect(
        availabilityPlaces(l, areaName: areaName),
        ['My place', 'Indirapuram', 'Vaishali'],
      );
    });

    // The bug phase 2U was written to fix. Service areas are required of every
    // individual because that is also how search locates them, so a coach who
    // only ever teaches at their own centre was offered availability rows for
    // areas they have never visited — and a scheduler would have believed it.
    test('a coach who does not travel gets no areas', () {
      final l = complete()
        ..teachingPlaces = ['my_academy']
        ..travelsToStudents = false
        ..serviceAreaIds = ['area-1', 'area-2'];
      expect(availabilityPlaces(l, areaName: areaName), ['My place']);
    });

    test('a class format is never a place', () {
      final l = complete()
        ..teachingPlaces = ['group_classes', 'individual_classes']
        ..travelsToStudents = false;
      expect(availabilityPlaces(l, areaName: areaName), isEmpty);
    });

    // Bare names. Reference.areaLabel renders "Indirapuram, Ghaziabad" for a
    // flat picker, and storing that would be the same mismatch a second time.
    test('an area the reference does not know is skipped, not blank', () {
      final l = complete()
        ..teachingPlaces = <String>[]
        ..travelsToStudents = true
        ..serviceAreaIds = ['area-1', 'area-gone'];
      expect(availabilityPlaces(l, areaName: areaName), ['Indirapuram']);
    });
  });

  group('certifications', () {
    test('ignore a blank row', () {
      final l = complete()..certifications = [Certification()];
      expect(listingProblems(l, phone: '9876543210'), isEmpty);
    });

    test('need a name once anything is typed', () {
      final l = complete()
        ..certifications = [Certification(issuer: 'Kala Kendra')];
      expect(messages(l), contains('Every certification needs a name.'));
    });

    test('want a four-digit year', () {
      final l = complete()
        ..certifications = [Certification(name: 'Visharad', year: '19')];
      expect(messages(l),
          contains('Certification year should be a 4-digit year.'));
    });
  });

  test('a photo is required — it is what a parent looks at first', () {
    final l = complete()..photoUrl = null;
    expect(messages(l), contains('A profile photo is required.'));
  });

  group('what gets sent', () {
    test('an institution sends branches and no service areas', () {
      final l = complete()
        ..providerType = 'institution'
        ..serviceAreaIds = ['area-1']
        ..branches = [Branch(label: 'Main', address: 'x', areaId: 'area-2')];

      final json = l.toSaveJson();
      expect(json['serviceAreaIds'], isEmpty);
      expect(json['branches'] as List, hasLength(1));
    });

    test('an individual sends service areas and no branches', () {
      final l = complete()
        ..branches = [Branch(label: 'Main', address: 'x', areaId: 'area-2')];

      final json = l.toSaveJson();
      expect(json['branches'], isEmpty);
      expect(json['serviceAreaIds'], ['area-1']);
    });

    test('a branch with no area is dropped, not refused by the server', () {
      final l = complete()
        ..providerType = 'institution'
        ..branches = [
          Branch(label: 'Real', address: 'x', areaId: 'area-2'),
          Branch(label: 'Half typed'),
        ];

      expect(l.toSaveJson()['branches'] as List, hasLength(1));
    });

    test('numbers are parsed once, on save', () {
      final l = complete()
        ..age = '34'
        ..experienceYears = '11'
        ..feeMin = '1500'
        ..feePeriod = 'per_month';

      final json = l.toSaveJson();
      expect(json['age'], 34);
      expect(json['experienceYears'], 11);
      expect(json['feeMin'], 1500);
    });

    test('an empty optional is omitted rather than sent as an empty string',
        () {
      final json = (complete()..feesNote = '   ').toSaveJson();
      expect(json.containsKey('feesNote'), isFalse);
    });
  });
}
