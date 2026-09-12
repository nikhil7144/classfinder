/// Neighbours asking for the same thing, together.
///
/// The idea the product is built on: one family asking for a Kathak teacher is
/// a lead, four families in the same society asking together is a class worth
/// travelling for.
///
/// `isCreator`, `isActive` and `pendingRequests` are answers about the caller
/// and the service resolves all three — only the creator is ever told how many
/// coaches have pitched.
library;

/// How long a group may run for, chosen when it is made. The same four the web
/// offers; the API takes any 1–30.
const groupValidityOptions = <int, String>{
  7: '1 week',
  10: '10 days',
  21: '3 weeks',
  30: '1 month',
};

/// The fewest families a group may ask for. One on its own is an enquiry, and
/// the whole argument for groups is neighbours asking together.
const groupMinStudents = 2;

/// A count, however it arrived.
///
/// These are bigints in Postgres. The service coerces them before they reach a
/// client, so a number is what turns up — but one model in this file tolerated
/// a string and the next did not, and a difference like that is only ever
/// discovered by something breaking.
int _count(Object? value) => value == null
    ? 0
    : (value is num ? value.toInt() : int.tryParse('$value') ?? 0);

class Group {
  const Group({
    required this.id,
    required this.serviceName,
    required this.areaName,
    required this.cityName,
    required this.societyName,
    required this.studentCount,
    required this.memberCount,
    required this.expiresAt,
    required this.closedAt,
    required this.isCreator,
    required this.isActive,
    required this.pendingRequests,
    required this.createdAt,
  });

  final String id;
  final String? serviceName;
  final String? areaName;
  final String? cityName;

  /// Identifying detail. Never shown to anybody outside the group — and the
  /// thing that makes neighbours recognise their own.
  final String? societyName;

  final int studentCount;
  final int memberCount;

  /// Time-boxed on purpose: stale demand costs a coach's trust faster than no
  /// demand does.
  final DateTime expiresAt;

  final DateTime? closedAt;
  final bool isCreator;

  /// Open, unexpired, and with enough families to be worth pitching to.
  final bool isActive;

  /// Coaches waiting on an answer. Zero to anybody but the creator.
  final int pendingRequests;

  final DateTime createdAt;

  bool get isClosed => closedAt != null;
  bool get hasExpired => expiresAt.isBefore(DateTime.now());

  /// Why it is not taking pitches, in the order that matters to a reader.
  /// Null when it is.
  String? get dormantReason {
    if (isClosed) return 'You closed it';
    if (hasExpired) return 'It has run out';
    if (!isActive) return 'Waiting for more families';
    return null;
  }

  /// How long is left, said the way somebody would say it.
  ///
  /// Counted in calendar days rather than as a duration. `inDays` truncates,
  /// so a group expiring in five days — five days minus the microseconds since
  /// the clock was read — came out as four. Days left is a question about
  /// dates, and that is how it is answered.
  String get remaining {
    if (hasExpired) return 'Ended';

    // Both dates read in the same timezone — the reader's. expiresAt arrives
    // as UTC, and taking its calendar date without converting compared a UTC
    // date against a local one: in India that is a different date between
    // midnight and half past five, so for those five and a half hours every
    // group in the country said it had a day less left than it did.
    final now = DateTime.now();
    final expiry = expiresAt.toLocal();
    final today = DateTime(now.year, now.month, now.day);
    final last = DateTime(expiry.year, expiry.month, expiry.day);
    final days = last.difference(today).inDays;

    if (days < 1) return 'Ends today';
    if (days == 1) return '1 day left';
    return '$days days left';
  }

  factory Group.fromJson(Map<String, dynamic> json) {
    return Group(
      id: json['id'] as String,
      serviceName: json['serviceName'] as String?,
      areaName: json['areaName'] as String?,
      cityName: json['cityName'] as String?,
      societyName: json['societyName'] as String?,
      studentCount: _count(json['studentCount']),
      memberCount: _count(json['memberCount']),
      expiresAt: DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
          DateTime.now(),
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.tryParse(json['closedAt'] as String),
      isCreator: json['isCreator'] as bool? ?? false,
      isActive: json['isActive'] as bool? ?? false,
      pendingRequests: _count(json['pendingRequests']),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
    );
  }
}

/// A group as somebody following an invite link sees it.
///
/// Deliberately not Group. This one is readable by a person who is not in it
/// yet, so it carries the notes and whether it can still be joined, and
/// nothing about who is already in.
class GroupInvite {
  const GroupInvite({
    required this.id,
    required this.serviceName,
    required this.areaName,
    required this.cityName,
    required this.societyName,
    required this.studentCount,
    required this.notes,
    required this.memberCount,
    required this.expiresAt,
    required this.isOpen,
    required this.alreadyMember,
  });

  final String id;
  final String? serviceName;
  final String? areaName;
  final String? cityName;
  final String? societyName;
  final int studentCount;
  final String? notes;
  final int memberCount;
  final DateTime expiresAt;
  final bool isOpen;

  /// False for a guest rather than an error.
  final bool alreadyMember;

  factory GroupInvite.fromJson(Map<String, dynamic> json) => GroupInvite(
        id: json['id'] as String,
        serviceName: json['serviceName'] as String?,
        areaName: json['areaName'] as String?,
        cityName: json['cityName'] as String?,
        societyName: json['societyName'] as String?,
        studentCount: _count(json['studentCount']),
        notes: json['notes'] as String?,
        memberCount: _count(json['memberCount']),
        expiresAt: DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
            DateTime.now(),
        isOpen: json['isOpen'] as bool? ?? false,
        alreadyMember: json['alreadyMember'] as bool? ?? false,
      );
}

enum PitchStatus {
  pending('pending', 'Waiting on you'),
  accepted('accepted', 'Accepted'),
  declined('declined', 'Declined');

  const PitchStatus(this.id, this.label);

  final String id;
  final String label;

  static PitchStatus parse(String? value) {
    for (final s in PitchStatus.values) {
      if (s.id == value) return s;
    }
    return PitchStatus.pending;
  }
}

/// A coach's pitch to a group, and the conversation it opened.
class GroupPitch {
  const GroupPitch({
    required this.requestId,
    required this.providerId,
    required this.providerName,
    required this.providerPhotoUrl,
    required this.pitch,
    required this.status,
    required this.createdAt,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.messageCount,
    required this.unread,
    required this.isCreator,
  });

  final String requestId;
  final String providerId;
  final String? providerName;
  final String? providerPhotoUrl;

  /// What they wrote to the group.
  final String? pitch;

  final PitchStatus status;
  final DateTime createdAt;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int messageCount;
  final bool unread;

  /// Whether the caller made the group this was pitched to. Only they answer.
  final bool isCreator;

  factory GroupPitch.fromJson(Map<String, dynamic> json) => GroupPitch(
        requestId: json['requestId'] as String,
        providerId: json['providerId'] as String? ?? '',
        providerName: json['providerName'] as String?,
        providerPhotoUrl: json['providerPhotoUrl'] as String?,
        pitch: json['pitch'] as String?,
        status: PitchStatus.parse(json['status'] as String?),
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        lastMessage: json['lastMessage'] as String?,
        lastMessageAt: json['lastMessageAt'] == null
            ? null
            : DateTime.tryParse(json['lastMessageAt'] as String),
        messageCount: _count(json['messageCount']),
        unread: json['unread'] as bool? ?? false,
        isCreator: json['isCreator'] as bool? ?? false,
      );
}

/// How to reach the group, once a coach has a reason to.
class GroupContact {
  const GroupContact({
    required this.phone,
    required this.name,
    required this.societyName,
    required this.shared,
  });

  /// Null unless the group chose to share one.
  final String? phone;
  final String? name;
  final String? societyName;

  /// Which kind of null a missing phone is — withheld, or not on file.
  final bool shared;

  factory GroupContact.fromJson(Map<String, dynamic> json) => GroupContact(
        phone: json['phone'] as String?,
        name: json['name'] as String?,
        societyName: json['societyName'] as String?,
        shared: json['shared'] as bool? ?? false,
      );
}
