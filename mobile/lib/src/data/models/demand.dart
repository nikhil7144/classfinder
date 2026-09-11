/// A family, or a group of them, who said what they want.
///
/// Carries no name, no email and no phone number, because the endpoint has no
/// such columns to carry. A coach sees the requirement and answers through
/// Aspire91; contact details arrive later and only if the family shares them.
class Demand {
  const Demand({
    required this.kind,
    required this.id,
    required this.serviceNames,
    required this.areaName,
    required this.cityName,
    required this.distanceKm,
    required this.learnerAge,
    required this.level,
    required this.preferredModes,
    required this.preferredDays,
    required this.preferredTime,
    required this.budgetMin,
    required this.budgetMax,
    required this.budgetPeriod,
    required this.notes,
    required this.studentCount,
    required this.memberCount,
    required this.expiresAt,
    required this.createdAt,
    required this.contactStatus,
    required this.threadId,
    required this.serviceCategoryIds,
  });

  /// 'student' — one parent's requirement. 'group' — neighbours who agreed on
  /// one before approaching anybody, which is why answering once reaches all
  /// of them.
  final String kind;
  final String id;

  final List<String> serviceCategoryIds;
  final List<String> serviceNames;
  final String? areaName;
  final String? cityName;
  final double? distanceKm;
  final int? learnerAge;
  final String? level;
  final List<String> preferredModes;
  final List<String> preferredDays;
  final String? preferredTime;
  final int? budgetMin;
  final int? budgetMax;
  final String? budgetPeriod;
  final String? notes;
  final int studentCount;
  final int memberCount;
  final DateTime? expiresAt;
  final DateTime createdAt;

  /// Set once this coach has written to them, null until. The feed puts
  /// untouched rows first, so this is what "already answered" looks like.
  final String? contactStatus;
  final String? threadId;

  bool get isGroup => kind == 'group';

  /// Whether this coach has already written. The endpoint refuses a second
  /// approach, so the UI should not offer one.
  bool get alreadyApproached => contactStatus != null;

  static List<String> _strings(dynamic value) =>
      value is List ? value.map((e) => e.toString()).toList() : const [];

  static int? _int(dynamic value) => value == null
      ? null
      : (value is num ? value.toInt() : int.tryParse('$value'));

  static double? _double(dynamic value) => value == null
      ? null
      : (value is num ? value.toDouble() : double.tryParse('$value'));

  factory Demand.fromJson(Map<String, dynamic> json) => Demand(
        kind: json['kind'] as String,
        id: json['id'] as String,
        serviceCategoryIds: _strings(json['serviceCategoryIds']),
        serviceNames: _strings(json['serviceNames']),
        areaName: json['areaName'] as String?,
        cityName: json['cityName'] as String?,
        distanceKm: _double(json['distanceKm']),
        learnerAge: _int(json['learnerAge']),
        level: json['level'] as String?,
        preferredModes: _strings(json['preferredModes']),
        preferredDays: _strings(json['preferredDays']),
        preferredTime: json['preferredTime'] as String?,
        budgetMin: _int(json['budgetMin']),
        budgetMax: _int(json['budgetMax']),
        budgetPeriod: json['budgetPeriod'] as String?,
        notes: json['notes'] as String?,
        studentCount: _int(json['studentCount']) ?? 0,
        memberCount: _int(json['memberCount']) ?? 0,
        expiresAt: json['expiresAt'] == null
            ? null
            : DateTime.tryParse(json['expiresAt'] as String),
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        contactStatus: json['contactStatus'] as String?,
        threadId: json['threadId'] as String?,
      );
}
