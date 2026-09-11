/// A family's own profile — who they are, and what they want.
///
/// One form doing two jobs, because the web's does: `SeekerProfileForm` asks
/// who you are and `RequirementFields` asks what you are looking for, and both
/// save in a single call.
///
/// Mutable for the same reason Listing is: it is what a form binds to, and
/// copying an immutable model on every keystroke buys nothing for a screen
/// that owns the only instance.
library;

const relations = <String, String>{
  'self': 'Myself',
  'mother': 'My child — I am their mother',
  'father': 'My child — I am their father',
  'guardian': 'My child — I am their guardian',
  'relative': 'A relative',
  'other': 'Somebody else',
};

const levels = <String, String>{
  'beginner': 'Just starting',
  'improver': 'Some experience',
  'advanced': 'Advanced',
  'exam_prep': 'Preparing for an exam',
};

const preferredTimes = <String, String>{
  'weekday_morning': 'Weekday mornings',
  'weekday_afternoon': 'Weekday afternoons',
  'weekday_evening': 'Weekday evenings',
  'weekend': 'Weekends',
  'flexible': 'Any time',
};

const budgetPeriods = <String, String>{
  'per_hour': 'per hour',
  'per_session': 'per session',
  'per_month': 'per month',
  'per_course': 'per course',
};

/// The three ways a class can run. The same ids the coach's listing uses, so a
/// parent's preference and a coach's offer are the same vocabulary.
const teachingModes = <String, String>{
  'own_centre': 'At their place',
  'student_home': 'At our home',
  'online': 'Online',
};

const weekDayLabels = <String, String>{
  'mon': 'Mon',
  'tue': 'Tue',
  'wed': 'Wed',
  'thu': 'Thu',
  'fri': 'Fri',
  'sat': 'Sat',
  'sun': 'Sun',
};

class SeekerProfile {
  SeekerProfile({
    this.id,
    this.name = '',
    this.relationToLearner,
    this.areaId,
    this.lat,
    this.lng,
    this.photoUrl,
    List<String>? lookingFor,
    this.learnerAge = '',
    this.level,
    List<String>? preferredModes,
    List<String>? preferredDays,
    this.preferredTime,
    this.budgetMin = '',
    this.budgetMax = '',
    this.budgetPeriod,
    this.requirementNotes = '',
    this.openToOffers = true,
    this.marketingOptIn = false,
    this.requirementUpdatedAt,
    this.profileComplete = false,
  })  : lookingFor = lookingFor ?? [],
        preferredModes = preferredModes ?? [],
        preferredDays = preferredDays ?? [];

  /// Null until the first save.
  final String? id;

  String name;
  String? relationToLearner;

  /// Where they are looking. What search is centred on.
  String? areaId;

  /// Set only if they said "use my location". Optional everywhere — the area's
  /// centroid is the fallback, and the web says so in as many words.
  double? lat;
  double? lng;

  String? photoUrl;

  List<String> lookingFor;

  // Held as typed text, parsed once on save. Same reason as Listing.
  String learnerAge;
  String budgetMin;
  String budgetMax;

  String? level;
  List<String> preferredModes;
  List<String> preferredDays;
  String? preferredTime;
  String? budgetPeriod;
  String requirementNotes;

  /// The consent switch, defaulted **on**: a parent who has just typed out what
  /// they want has, in the ordinary meaning of it, asked to be found. Off hides
  /// them from the coach demand feed entirely and immediately.
  bool openToOffers;

  /// Defaulted **off**, and asked in plain words.
  bool marketingOptIn;

  final DateTime? requirementUpdatedAt;
  final bool profileComplete;

  /// Whether anything has been said about what they want. Used to decide
  /// whether the requirement half of the form is worth showing as started.
  bool get hasRequirement =>
      lookingFor.isNotEmpty ||
      learnerAge.trim().isNotEmpty ||
      level != null ||
      preferredModes.isNotEmpty ||
      preferredDays.isNotEmpty ||
      preferredTime != null ||
      requirementNotes.trim().isNotEmpty;

  factory SeekerProfile.fromJson(Map<String, dynamic> json) {
    String number(Object? v) => v == null ? '' : '$v';

    return SeekerProfile(
      id: json['id'] as String?,
      name: json['name'] as String? ?? '',
      relationToLearner: json['relationToLearner'] as String?,
      areaId: json['areaId'] as String?,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      photoUrl: json['photoUrl'] as String?,
      lookingFor: ((json['lookingFor'] as List?) ?? const []).cast<String>(),
      learnerAge: number(json['learnerAge']),
      level: json['level'] as String?,
      preferredModes:
          ((json['preferredModes'] as List?) ?? const []).cast<String>(),
      preferredDays:
          ((json['preferredDays'] as List?) ?? const []).cast<String>(),
      preferredTime: json['preferredTime'] as String?,
      budgetMin: number(json['budgetMin']),
      budgetMax: number(json['budgetMax']),
      budgetPeriod: json['budgetPeriod'] as String?,
      requirementNotes: json['requirementNotes'] as String? ?? '',
      openToOffers: json['openToOffers'] as bool? ?? true,
      marketingOptIn: json['marketingOptIn'] as bool? ?? false,
      requirementUpdatedAt: json['requirementUpdatedAt'] == null
          ? null
          : DateTime.tryParse(json['requirementUpdatedAt'] as String),
      profileComplete: json['profileComplete'] as bool? ?? false,
    );
  }

  /// The whole profile, every time.
  ///
  /// save_seeker_profile() upserts the row, so a partial payload would clear
  /// what it omitted. The phone is not here — it lives on `profiles` and is
  /// saved by PUT /me/phone, which is the split that caught the coach side too.
  Map<String, dynamic> toSaveJson() {
    int? parse(String raw) =>
        raw.trim().isEmpty ? null : int.tryParse(raw.trim());
    String? text(String raw) => raw.trim().isEmpty ? null : raw.trim();

    return {
      'name': name.trim(),
      'relationToLearner': relationToLearner,
      'areaId': areaId,
      'lat': lat,
      'lng': lng,
      'photoUrl': photoUrl,
      'lookingFor': lookingFor,
      'learnerAge': parse(learnerAge),
      'level': level,
      'preferredModes': preferredModes,
      'preferredDays': preferredDays,
      'preferredTime': preferredTime,
      'budgetMin': parse(budgetMin),
      'budgetMax': parse(budgetMax),
      'budgetPeriod': budgetPeriod,
      'requirementNotes': text(requirementNotes),
      'openToOffers': openToOffers,
      'marketingOptIn': marketingOptIn,
    }..removeWhere((_, value) => value == null);
  }
}
