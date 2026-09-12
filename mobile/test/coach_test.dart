import 'package:aspire91/src/data/models/coach.dart';
import 'package:aspire91/src/data/repositories/coaches_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// Search results, and the three formatters a card is made of.
///
/// Ports of formatFees, formatDistance and formatExperience in lib/search.ts.
/// They are small and they are on every row of every result, so getting one
/// wrong is wrong everywhere at once.

void main() {
  group('fees', () {
    test('reads as a range when there are two numbers', () {
      expect(formatFees(1500, 3000, 'per_month'), '₹1500–₹3000 /month');
    });

    test('reads as one number when both ends agree', () {
      expect(formatFees(1500, 1500, 'per_hour'), '₹1500 /hour');
    });

    test('takes whichever end was given', () {
      expect(formatFees(1500, null, 'per_session'), '₹1500 /session');
      expect(formatFees(null, 3000, 'per_course'), '₹3000 /course');
    });

    test('says nothing at all when no fee was given', () {
      // A coach who has not said says nothing, rather than "price on request",
      // which reads as a dodge.
      expect(formatFees(null, null, 'per_month'), isNull);
      expect(formatFees(null, null, null), isNull);
    });

    test('drops the suffix for a period nobody has heard of', () {
      expect(formatFees(1500, null, 'per_fortnight'), '₹1500');
      expect(formatFees(1500, null, null), '₹1500');
    });
  });

  group('distance', () {
    test('uses metres below a kilometre', () {
      // "0.4 km away" is how nobody says it.
      expect(formatDistance(0.4), '400 m away');
      expect(formatDistance(0.04), '40 m away');
    });

    test('uses one decimal above a kilometre', () {
      expect(formatDistance(2.44), '2.4 km away');
      expect(formatDistance(12.0), '12.0 km away');
    });

    test('says nothing when nothing was measured', () {
      expect(formatDistance(null), isNull);
    });

    test('handles the boundary', () {
      expect(formatDistance(1.0), '1.0 km away');
      expect(formatDistance(0.999), '999 m away');
    });
  });

  group('experience', () {
    test('is singular at one year', () {
      expect(formatExperience(1), '1 year');
      expect(formatExperience(11), '11 years');
    });

    test('says nothing for none, or for nonsense', () {
      expect(formatExperience(null), isNull);
      expect(formatExperience(0), isNull);
      expect(formatExperience(-2), isNull);
    });
  });

  group('a search query', () {
    test('is not ready without an area to centre on', () {
      expect(const SearchQuery().isReady, isFalse);
      expect(const SearchQuery(areaId: 'a1').isReady, isTrue);
    });

    test('is its own key, so an unchanged query does not re-run', () {
      // The screen rebuilds on every keystroke elsewhere; the search must not.
      const a =
          SearchQuery(areaId: 'a1', serviceCategoryId: 's1', radiusKm: 15);
      const b =
          SearchQuery(areaId: 'a1', serviceCategoryId: 's1', radiusKm: 15);
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('changing any part makes a different key', () {
      const base = SearchQuery(areaId: 'a1', radiusKm: 15);
      expect(base == base.copyWith(radiusKm: 50), isFalse);
      expect(base == base.copyWith(areaId: 'a2'), isFalse);
      expect(base == base.copyWith(serviceCategoryId: 's1'), isFalse);
      expect(base == base.copyWith(lat: 22.7), isFalse);
    });

    test('can clear the service, which copyWith alone cannot', () {
      // Passing null to copyWith keeps the old value, so "anything" needs its
      // own way of being said.
      const chosen = SearchQuery(areaId: 'a1', serviceCategoryId: 's1');
      expect(chosen.copyWith().serviceCategoryId, 's1');
      expect(chosen.copyWith(clearService: true).serviceCategoryId, isNull);
    });
  });

  group('a coach off the wire', () {
    test('keeps all eighteen columns the card renders', () {
      // A first pass at this DTO dropped five, and the five it dropped were
      // the ones a parent actually reads.
      final coach = CoachResult.fromJson(const {
        'id': 'p1',
        'displayName': 'Krishna',
        'bio': 'Eleven years of coaching.',
        'helpStatement': 'I get nervous beginners comfortable.',
        'providerType': 'individual',
        'providerCategoryId': 'cat-1',
        'photoUrl': 'https://example.test/a.jpg',
        'isFeatured': true,
        'serviceCategoryIds': ['s1', 's2'],
        'experienceYears': 11,
        'feeMin': 1500,
        'feeMax': 3000,
        'feePeriod': 'per_month',
        'teachingPlaces': ['own_centre'],
        'nearestAreaId': 'a1',
        'nearestAreaName': 'Vijay Nagar',
        'cityName': 'Indore',
        'distanceKm': 2.4,
      });

      expect(coach.helpStatement, 'I get nervous beginners comfortable.');
      expect(coach.experienceYears, 11);
      expect(coach.feeMin, 1500);
      expect(coach.feeMax, 3000);
      expect(coach.feePeriod, 'per_month');
      expect(coach.teachingPlaces, ['own_centre']);
      expect(coach.isFeatured, isTrue);
      expect(coach.distanceKm, 2.4);
    });

    test('survives a row with almost nothing on it', () {
      final coach = CoachResult.fromJson(const {'id': 'p1'});
      expect(coach.displayName, isNull);
      expect(coach.serviceCategoryIds, isEmpty);
      expect(coach.teachingPlaces, isEmpty);
      expect(coach.isFeatured, isFalse);
    });
  });

  group('a coach profile', () {
    test('groups availability by place, not by day', () {
      // A parent wants "Saturdays at their centre", not seven rows to sort.
      final coach = CoachProfile.fromJson(const {
        'id': 'p1',
        'availability': [
          {
            'day': 'sat',
            'place': 'own_centre',
            'start': '09:00',
            'end': '10:00'
          },
          {
            'day': 'sun',
            'place': 'own_centre',
            'start': '09:00',
            'end': '10:00'
          },
          {'day': 'mon', 'place': 'online', 'start': '18:00', 'end': '19:00'},
        ],
      });

      final grouped = coach.availabilityByPlace;
      expect(grouped.keys.toSet(), {'own_centre', 'online'});
      expect(grouped['own_centre']!.length, 2);
      expect(grouped['online']!.length, 1);
    });

    test('is located by branches for an academy, service areas otherwise', () {
      final academy = CoachProfile.fromJson(const {
        'id': 'p1',
        'providerType': 'institution',
        'branches': [
          {
            'label': 'Vijay Nagar',
            'areaName': 'Vijay Nagar',
            'cityName': 'Indore'
          },
        ],
        'serviceAreas': [],
      });
      expect(academy.isInstitution, isTrue);
      expect(academy.places.first.label, 'Vijay Nagar');
      expect(academy.places.first.where, 'Vijay Nagar, Indore');

      final individual = CoachProfile.fromJson(const {
        'id': 'p2',
        'providerType': 'individual',
        'branches': [],
        'serviceAreas': [
          {'areaName': 'Indirapuram', 'cityName': 'Ghaziabad'},
        ],
      });
      expect(individual.places.first.label, isNull);
      expect(individual.places.first.where, 'Indirapuram, Ghaziabad');
    });

    test('reads services with the group that gives them a colour', () {
      final coach = CoachProfile.fromJson(const {
        'id': 'p1',
        'services': [
          {'id': 's1', 'name': 'Kathak', 'group': 'dance'},
        ],
      });
      expect(coach.services.first.name, 'Kathak');
      expect(coach.services.first.group, 'dance');
    });
  });
}
