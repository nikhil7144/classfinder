/// A coach's own listing, as they edit it.
///
/// Mutable, unlike every other model here, because it is what a form binds to.
/// The alternative — an immutable model copied on every keystroke — buys
/// nothing for a screen that owns the only instance and throws it away when it
/// closes.
///
/// The field names match both MyListingDto and SaveProviderProfileDto, which
/// the service keeps deliberately identical. So this loads from one and sends
/// to the other with no translation layer in between.
library;

class Certification {
  Certification({this.name = '', this.issuer = '', this.year = ''});

  String name;
  String issuer;

  /// Text, not a number: coaches write '2019' and 'expected 2027' alike.
  String year;

  bool get isBlank =>
      name.trim().isEmpty && issuer.trim().isEmpty && year.trim().isEmpty;

  factory Certification.fromJson(Map<String, dynamic> json) => Certification(
        name: json['name'] as String? ?? '',
        issuer: json['issuer'] as String? ?? '',
        year: json['year'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'issuer': issuer.trim(),
        'year': year.trim(),
      };
}

/// One block of time, at one place, on one day.
class AvailabilitySlot {
  AvailabilitySlot({
    this.day = 'mon',
    this.place = '',
    this.start = '16:00',
    this.end = '18:00',
  });

  String day;

  /// Which of the coach's teaching places this slot is at — so the list only
  /// offers the ones they have actually selected above.
  String place;
  String start;
  String end;

  factory AvailabilitySlot.fromJson(Map<String, dynamic> json) =>
      AvailabilitySlot(
        day: json['day'] as String? ?? 'mon',
        place: json['place'] as String? ?? '',
        start: json['start'] as String? ?? '16:00',
        end: json['end'] as String? ?? '18:00',
      );

  Map<String, dynamic> toJson() =>
      {'day': day, 'place': place, 'start': start, 'end': end};
}

/// One branch of an institution. Individuals use service areas instead.
class Branch {
  Branch({this.label = '', this.address = '', this.areaId, this.phone = ''});

  String label;
  String address;

  /// Where it is. This is what makes it findable, so a branch without one is
  /// not saved.
  String? areaId;
  String phone;

  bool get isBlank =>
      label.trim().isEmpty &&
      address.trim().isEmpty &&
      areaId == null &&
      phone.trim().isEmpty;

  factory Branch.fromJson(Map<String, dynamic> json) => Branch(
        label: json['label'] as String? ?? '',
        address: json['address'] as String? ?? '',
        areaId: json['areaId'] as String?,
        phone: json['phone'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'label': label.trim().isEmpty ? null : label.trim(),
        'address': address.trim().isEmpty ? null : address.trim(),
        'areaId': areaId,
        'phone': phone.trim().isEmpty ? null : phone.trim(),
      };
}

class Listing {
  Listing({
    this.id,
    this.providerType = 'individual',
    this.providerCategoryId,
    this.displayName = '',
    this.bio = '',
    this.helpStatement = '',
    this.age = '',
    this.experienceYears = '',
    this.feeMin = '',
    this.feeMax = '',
    this.feePeriod,
    this.feesNote = '',
    List<String>? teachingPlaces,
    this.travelsToStudents,
    List<Certification>? certifications,
    List<AvailabilitySlot>? availability,
    List<String>? serviceCategoryIds,
    this.photoUrl,
    List<Branch>? branches,
    List<String>? serviceAreaIds,
    this.approved = false,
    this.isSuspended = false,
    this.profileComplete = false,
  })  : teachingPlaces = teachingPlaces ?? [],
        certifications = certifications ?? [],
        availability = availability ?? [],
        serviceCategoryIds = serviceCategoryIds ?? [],
        branches = branches ?? [],
        serviceAreaIds = serviceAreaIds ?? [];

  /// Null until the first save. The API answers 404 for a coach who has none,
  /// which the screen reads as "new listing" rather than as an error.
  final String? id;

  String providerType;
  String? providerCategoryId;
  String displayName;
  String bio;
  String helpStatement;

  // Numbers are held as the text somebody typed. Parsing on every keystroke
  // means "1" becomes 1 and then a backspace has nothing to delete; these are
  // parsed once, on save.
  String age;
  String experienceYears;
  String feeMin;
  String feeMax;

  String? feePeriod;
  String feesNote;
  List<String> teachingPlaces;

  /// Individuals: do they go to the student, or does the student come to them?
  /// Null means unanswered, which is different from "no".
  bool? travelsToStudents;

  List<Certification> certifications;
  List<AvailabilitySlot> availability;
  List<String> serviceCategoryIds;
  String? photoUrl;
  List<Branch> branches;
  List<String> serviceAreaIds;

  // State, not input. The save endpoint refuses all three.
  final bool approved;
  final bool isSuspended;
  final bool profileComplete;

  bool get isInstitution => providerType == 'institution';
  bool get isEventPlanner => providerType == 'event_planner';

  factory Listing.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) =>
        ((json[key] as List?) ?? const [])
            .map((e) => parse(e as Map<String, dynamic>))
            .toList();

    String number(Object? value) => value == null ? '' : '$value';

    return Listing(
      id: json['id'] as String?,
      providerType: json['providerType'] as String? ?? 'individual',
      providerCategoryId: json['providerCategoryId'] as String?,
      displayName: json['displayName'] as String? ?? '',
      bio: json['bio'] as String? ?? '',
      helpStatement: json['helpStatement'] as String? ?? '',
      age: number(json['age']),
      experienceYears: number(json['experienceYears']),
      feeMin: number(json['feeMin']),
      feeMax: number(json['feeMax']),
      feePeriod: json['feePeriod'] as String?,
      feesNote: json['feesNote'] as String? ?? '',
      teachingPlaces:
          ((json['teachingPlaces'] as List?) ?? const []).cast<String>(),
      travelsToStudents: json['travelsToStudents'] as bool?,
      certifications: list('certifications', Certification.fromJson),
      availability: list('availability', AvailabilitySlot.fromJson),
      serviceCategoryIds:
          ((json['serviceCategoryIds'] as List?) ?? const []).cast<String>(),
      photoUrl: json['photoUrl'] as String?,
      branches: list('branches', Branch.fromJson),
      serviceAreaIds:
          ((json['serviceAreaIds'] as List?) ?? const []).cast<String>(),
      approved: json['approved'] as bool? ?? false,
      isSuspended: json['isSuspended'] as bool? ?? false,
      profileComplete: json['profileComplete'] as bool? ?? false,
    );
  }

  /// The whole listing, every time.
  ///
  /// save_provider_profile() replaces branches and service areas wholesale, so
  /// a partial payload would clear whatever it left out. Blank repeater rows
  /// are dropped here rather than sent and rejected — the form starts with one
  /// of each, and somebody who ignores it has not made a mistake.
  Map<String, dynamic> toSaveJson() {
    num? parse(String raw) =>
        raw.trim().isEmpty ? null : num.tryParse(raw.trim());
    String? text(String raw) => raw.trim().isEmpty ? null : raw.trim();

    return {
      'providerType': providerType,
      'providerCategoryId': providerCategoryId,
      'displayName': displayName.trim(),
      'bio': text(bio),
      'helpStatement': text(helpStatement),
      'age': parse(age)?.toInt(),
      'experienceYears': parse(experienceYears)?.toInt(),
      'feeMin': parse(feeMin),
      'feeMax': parse(feeMax),
      'feePeriod': feePeriod,
      'feesNote': text(feesNote),
      'teachingPlaces': teachingPlaces,
      'travelsToStudents': travelsToStudents ?? false,
      'certifications': certifications
          .where((c) => !c.isBlank)
          .map((c) => c.toJson())
          .toList(),
      'availability': availability.map((a) => a.toJson()).toList(),
      'serviceCategoryIds': serviceCategoryIds,
      'photoUrl': photoUrl,
      // Branches belong to institutions and service areas to everybody else.
      // Sending both would be a listing in two places at once, and the
      // function takes whichever it is given.
      'branches': isInstitution
          ? branches
              .where((b) => !b.isBlank && b.areaId != null)
              .map((b) => b.toJson())
              .toList()
          : const [],
      'serviceAreaIds': isInstitution ? const <String>[] : serviceAreaIds,
    }..removeWhere((_, value) => value == null);
  }
}
