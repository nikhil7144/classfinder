/// One family's place at an event.
///
/// The register a coach works from on the day: who has entered, who has paid,
/// who withdrew. This is also the one place in the product that holds a
/// child's name and date of birth, which is why the consent on the entry form
/// is not optional and why nothing here is shown to anybody but the two
/// parties.
library;

const paymentStatuses = <String, String>{
  'unpaid': 'Unpaid',
  'paid': 'Paid',
  'refund_due': 'Refund due',
  'refunded': 'Refunded',
  'waived': 'Waived',
};

const paymentModes = <String, String>{
  'cash': 'Cash',
  'upi': 'UPI',
  'bank_transfer': 'Bank transfer',
  'card': 'Card',
  'other': 'Other',
};

/// One member of a team entry. Empty for an individual.
class EntryMember {
  const EntryMember({
    required this.id,
    required this.name,
    required this.dob,
    required this.sortOrder,
  });

  final String id;
  final String name;
  final DateTime? dob;
  final int sortOrder;

  factory EntryMember.fromJson(Map<String, dynamic> json) => EntryMember(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        dob: json['dob'] == null
            ? null
            : DateTime.tryParse(json['dob'] as String),
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      );
}

class Entry {
  const Entry({
    required this.id,
    required this.eventId,
    required this.eventTitle,
    required this.eventStartsAt,
    required this.eventStatus,
    required this.categoryId,
    required this.categoryName,
    required this.seekerId,
    required this.participantName,
    required this.participantDob,
    required this.status,
    required this.paymentStatus,
    required this.paymentMode,
    required this.paymentReference,
    required this.paidAt,
    required this.amountDue,
    required this.receiptNo,
    required this.enteredAt,
    required this.cancelledAt,
    required this.cancelledReason,
    required this.cancelledByMe,
    required this.members,
  });

  final String id;
  final String eventId;
  final String? eventTitle;
  final DateTime? eventStartsAt;
  final String? eventStatus;
  final String categoryId;
  final String? categoryName;
  final String seekerId;

  /// A child's name. Shown to the organiser running the register and nobody
  /// else.
  final String participantName;
  final DateTime? participantDob;

  /// 'confirmed' or 'cancelled'.
  final String status;

  final String paymentStatus;
  final String? paymentMode;
  final String? paymentReference;
  final DateTime? paidAt;

  /// What this entry owes, in rupees. Null when the category is free.
  final num? amountDue;

  final String receiptNo;
  final DateTime enteredAt;
  final DateTime? cancelledAt;
  final String? cancelledReason;

  /// Whether the caller is the one who cancelled it. A family withdrawing and
  /// an organiser removing somebody read differently on the register.
  final bool cancelledByMe;

  final List<EntryMember> members;

  bool get isCancelled => status == 'cancelled';
  bool get isPaid => paymentStatus == 'paid' || paymentStatus == 'waived';
  bool get isTeam => members.isNotEmpty;

  String get paymentLabel => paymentStatuses[paymentStatus] ?? paymentStatus;

  /// The age on the day of the event, which is what an age-banded category is
  /// actually about — not the age today.
  int? ageAt(DateTime? when) {
    final dob = participantDob;
    if (dob == null || when == null) return null;
    var years = when.year - dob.year;
    final hadBirthday = when.month > dob.month ||
        (when.month == dob.month && when.day >= dob.day);
    if (!hadBirthday) years -= 1;
    return years < 0 ? null : years;
  }

  factory Entry.fromJson(Map<String, dynamic> json) {
    DateTime? date(Object? v) =>
        v == null ? null : DateTime.tryParse(v as String);

    return Entry(
      id: json['id'] as String,
      eventId: json['eventId'] as String? ?? '',
      eventTitle: json['eventTitle'] as String?,
      eventStartsAt: date(json['eventStartsAt']),
      eventStatus: json['eventStatus'] as String?,
      categoryId: json['categoryId'] as String? ?? '',
      categoryName: json['categoryName'] as String?,
      seekerId: json['seekerId'] as String? ?? '',
      participantName: json['participantName'] as String? ?? '',
      participantDob: date(json['participantDob']),
      status: json['status'] as String? ?? 'confirmed',
      paymentStatus: json['paymentStatus'] as String? ?? 'unpaid',
      paymentMode: json['paymentMode'] as String?,
      paymentReference: json['paymentReference'] as String?,
      paidAt: date(json['paidAt']),
      amountDue: json['amountDue'] as num?,
      receiptNo: json['receiptNo'] as String? ?? '',
      enteredAt: date(json['enteredAt']) ?? DateTime.now(),
      cancelledAt: date(json['cancelledAt']),
      cancelledReason: json['cancelledReason'] as String?,
      cancelledByMe: json['cancelledByMe'] as bool? ?? false,
      members: ((json['members'] as List?) ?? const [])
          .map((e) => EntryMember.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
