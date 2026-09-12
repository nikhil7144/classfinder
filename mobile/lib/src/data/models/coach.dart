/// A coach, as search returns them and as their own page shows them.
///
/// Two shapes, deliberately. `CoachResult` is the card in a list of results;
/// `CoachProfile` is the page behind it. The card carries eighteen columns
/// because ProviderCard renders all of them — an earlier pass at this dropped
/// five, and the five it dropped were the ones a parent actually reads.
library;

/// One row of search results.
class CoachResult {
  const CoachResult({
    required this.id,
    required this.displayName,
    required this.bio,
    required this.helpStatement,
    required this.providerType,
    required this.providerCategoryId,
    required this.photoUrl,
    required this.isFeatured,
    required this.serviceCategoryIds,
    required this.experienceYears,
    required this.feeMin,
    required this.feeMax,
    required this.feePeriod,
    required this.teachingPlaces,
    required this.nearestAreaId,
    required this.nearestAreaName,
    required this.cityName,
    required this.distanceKm,
  });

  final String id;
  final String? displayName;
  final String? bio;

  /// The one sentence a parent reads first.
  final String? helpStatement;

  final String providerType;
  final String? providerCategoryId;
  final String? photoUrl;

  /// Paid placement. Labelled rather than hidden, so a parent can see it is.
  final bool isFeatured;

  final List<String> serviceCategoryIds;
  final int? experienceYears;
  final num? feeMin;
  final num? feeMax;
  final String? feePeriod;
  final List<String> teachingPlaces;
  final String? nearestAreaId;
  final String? nearestAreaName;
  final String? cityName;

  /// From wherever the search was centred — a given lat/lng, or the area's
  /// centroid when nobody shared one.
  final double? distanceKm;

  factory CoachResult.fromJson(Map<String, dynamic> json) => CoachResult(
        id: json['id'] as String,
        displayName: json['displayName'] as String?,
        bio: json['bio'] as String?,
        helpStatement: json['helpStatement'] as String?,
        providerType: json['providerType'] as String? ?? 'individual',
        providerCategoryId: json['providerCategoryId'] as String?,
        photoUrl: json['photoUrl'] as String?,
        isFeatured: json['isFeatured'] as bool? ?? false,
        serviceCategoryIds:
            ((json['serviceCategoryIds'] as List?) ?? const []).cast<String>(),
        experienceYears: (json['experienceYears'] as num?)?.toInt(),
        feeMin: json['feeMin'] as num?,
        feeMax: json['feeMax'] as num?,
        feePeriod: json['feePeriod'] as String?,
        teachingPlaces:
            ((json['teachingPlaces'] as List?) ?? const []).cast<String>(),
        nearestAreaId: json['nearestAreaId'] as String?,
        nearestAreaName: json['nearestAreaName'] as String?,
        cityName: json['cityName'] as String?,
        distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      );
}

/// "₹1,500–3,000 /month", or nothing at all.
///
/// A coach who has given no fee says nothing rather than "price on request",
/// which reads as a dodge. Ported from formatFees in lib/search.ts.
String? formatFees(num? min, num? max, String? period) {
  if (min == null && max == null) return null;

  const suffix = {
    'per_hour': '/hour',
    'per_session': '/session',
    'per_month': '/month',
    'per_course': '/course',
  };

  String rupees(num v) => '₹${v.round()}';

  final amount = min != null && max != null && max != min
      ? '${rupees(min)}–${rupees(max)}'
      : rupees(min ?? max!);

  final per = suffix[period];
  return per == null ? amount : '$amount $per';
}

/// "400 m away" / "2.4 km away". Metres below a kilometre, because "0.4 km"
/// is how nobody says it.
String? formatDistance(double? km) {
  if (km == null) return null;
  if (km < 1) return '${(km * 1000).round()} m away';
  return '${km.toStringAsFixed(1)} km away';
}

String? formatExperience(int? years) {
  if (years == null || years <= 0) return null;
  return years == 1 ? '1 year' : '$years years';
}

class Certification {
  const Certification({
    required this.name,
    required this.issuer,
    required this.year,
  });

  final String name;
  final String issuer;
  final String year;

  factory Certification.fromJson(Map<String, dynamic> json) => Certification(
        name: json['name'] as String? ?? '',
        issuer: json['issuer'] as String? ?? '',
        year: json['year'] as String? ?? '',
      );
}

class AvailabilitySlot {
  const AvailabilitySlot({
    required this.day,
    required this.place,
    required this.start,
    required this.end,
  });

  final String day;
  final String place;
  final String start;
  final String end;

  factory AvailabilitySlot.fromJson(Map<String, dynamic> json) =>
      AvailabilitySlot(
        day: json['day'] as String? ?? '',
        place: json['place'] as String? ?? '',
        start: json['start'] as String? ?? '',
        end: json['end'] as String? ?? '',
      );
}

/// A service a coach teaches, with its taxonomy group for the colour.
class CoachService {
  const CoachService(
      {required this.id, required this.name, required this.group});

  final String id;
  final String name;
  final String group;

  factory CoachService.fromJson(Map<String, dynamic> json) => CoachService(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        group: json['group'] as String? ?? '',
      );
}

/// One branch of an academy, or one area an individual serves.
///
/// Two shapes in the contract — `branches` carries a label and an address,
/// `serviceAreas` only a place — and one here, because a parent reading "where"
/// does not care which table it came from. `label` is null for a service area,
/// which is what tells them apart when it matters.
class CoachPlace {
  const CoachPlace({
    required this.label,
    required this.address,
    required this.areaName,
    required this.cityName,
  });

  final String? label;
  final String? address;
  final String? areaName;
  final String? cityName;

  /// "Vijay Nagar, Indore".
  String get where =>
      [areaName, cityName].where((s) => s != null && s.isNotEmpty).join(', ');

  factory CoachPlace.fromJson(Map<String, dynamic> json) => CoachPlace(
        label: json['label'] as String?,
        address: json['address'] as String?,
        areaName: json['areaName'] as String?,
        cityName: json['cityName'] as String?,
      );
}

/// A coach's public page.
class CoachProfile {
  const CoachProfile({
    required this.id,
    required this.displayName,
    required this.bio,
    required this.helpStatement,
    required this.providerType,
    required this.photoUrl,
    required this.isFeatured,
    required this.age,
    required this.experienceYears,
    required this.feeMin,
    required this.feeMax,
    required this.feePeriod,
    required this.feesNote,
    required this.teachingPlaces,
    required this.certifications,
    required this.availability,
    required this.categoryName,
    required this.services,
    required this.branches,
    required this.serviceAreas,
  });

  final String id;
  final String? displayName;
  final String? bio;
  final String? helpStatement;
  final String providerType;
  final String? photoUrl;
  final bool isFeatured;
  final int? age;
  final int? experienceYears;
  final num? feeMin;
  final num? feeMax;
  final String? feePeriod;
  final String? feesNote;
  final List<String> teachingPlaces;
  final List<Certification> certifications;
  final List<AvailabilitySlot> availability;
  final String? categoryName;
  final List<CoachService> services;

  /// An academy is located by its branches, an individual by the areas they
  /// serve. Exactly one of these is ever populated.
  final List<CoachPlace> branches;
  final List<CoachPlace> serviceAreas;

  bool get isInstitution => providerType == 'institution';

  /// Wherever they work, whichever of the two it came from.
  List<CoachPlace> get places => branches.isNotEmpty ? branches : serviceAreas;

  /// Availability grouped by teaching place, which is how the web reads it: a
  /// parent wants "Saturdays at their centre", not seven rows to sort.
  Map<String, List<AvailabilitySlot>> get availabilityByPlace {
    final grouped = <String, List<AvailabilitySlot>>{};
    for (final slot in availability) {
      grouped.putIfAbsent(slot.place, () => []).add(slot);
    }
    return grouped;
  }

  factory CoachProfile.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) =>
        ((json[key] as List?) ?? const [])
            .map((e) => parse(e as Map<String, dynamic>))
            .toList();

    return CoachProfile(
      id: json['id'] as String,
      displayName: json['displayName'] as String?,
      bio: json['bio'] as String?,
      helpStatement: json['helpStatement'] as String?,
      providerType: json['providerType'] as String? ?? 'individual',
      photoUrl: json['photoUrl'] as String?,
      isFeatured: json['isFeatured'] as bool? ?? false,
      age: (json['age'] as num?)?.toInt(),
      experienceYears: (json['experienceYears'] as num?)?.toInt(),
      feeMin: json['feeMin'] as num?,
      feeMax: json['feeMax'] as num?,
      feePeriod: json['feePeriod'] as String?,
      feesNote: json['feesNote'] as String?,
      teachingPlaces:
          ((json['teachingPlaces'] as List?) ?? const []).cast<String>(),
      certifications: list('certifications', Certification.fromJson),
      availability: list('availability', AvailabilitySlot.fromJson),
      categoryName: json['categoryName'] as String?,
      services: list('services', CoachService.fromJson),
      branches: list('branches', CoachPlace.fromJson),
      serviceAreas: list('serviceAreas', CoachPlace.fromJson),
    );
  }
}
