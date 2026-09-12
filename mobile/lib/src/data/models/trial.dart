/// A first class, arranged inside a conversation.
///
/// The product's whole argument is that a family and a coach should end up in
/// a room together, and this is the row that says when. It hangs off a thread
/// rather than standing alone: a trial nobody is talking about is a calendar
/// entry, not an arrangement.
///
/// `iProposed` and `myOutcome` are answers about the caller, so the same trial
/// reads differently to the two people in it. The service resolves both.
library;

enum TrialStatus {
  proposed('proposed', 'Suggested'),
  confirmed('confirmed', 'Confirmed'),
  declined('declined', 'Declined');

  const TrialStatus(this.id, this.label);

  final String id;
  final String label;

  static TrialStatus parse(String? value) {
    for (final s in TrialStatus.values) {
      if (s.id == value) return s;
    }
    return TrialStatus.proposed;
  }
}

/// What happened, recorded per side. Neither answer overwrites the other: a
/// coach marking a no-show does not put that on the family's record.
enum TrialOutcome {
  happened('happened', 'It happened'),
  noShow('no_show', 'Nobody came'),
  cancelled('cancelled', 'Called off');

  const TrialOutcome(this.id, this.label);

  final String id;
  final String label;

  static TrialOutcome? parse(String? value) {
    for (final o in TrialOutcome.values) {
      if (o.id == value) return o;
    }
    return null;
  }
}

class Trial {
  const Trial({
    required this.id,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.place,
    required this.placeLabel,
    required this.placeNote,
    required this.studentCount,
    required this.status,
    required this.proposedBy,
    required this.iProposed,
    required this.seekerOutcome,
    required this.providerOutcome,
    required this.myOutcome,
    required this.createdAt,
  });

  final String id;
  final DateTime scheduledAt;
  final int durationMinutes;

  /// A teaching place id, not a uuid.
  final String? place;
  final String? placeLabel;
  final String? placeNote;

  /// For a group, how many are coming.
  final int? studentCount;

  final TrialStatus status;
  final String proposedBy;

  /// Whether the caller suggested it. The other side answers; you cannot
  /// confirm your own.
  final bool iProposed;

  final TrialOutcome? seekerOutcome;
  final TrialOutcome? providerOutcome;

  /// Whichever of the two above belongs to the caller.
  final TrialOutcome? myOutcome;

  final DateTime createdAt;

  /// Waiting on the other side to say yes or no.
  bool get awaitingTheirAnswer => status == TrialStatus.proposed && iProposed;

  /// Waiting on the caller.
  bool get awaitingMyAnswer => status == TrialStatus.proposed && !iProposed;

  /// Been and gone, so what happened is worth asking about. Only a confirmed
  /// trial earns the question — nobody owes an outcome for a time that was
  /// never agreed.
  bool get isPast =>
      status == TrialStatus.confirmed && scheduledAt.isBefore(DateTime.now());

  bool get needsOutcome => isPast && myOutcome == null;

  factory Trial.fromJson(Map<String, dynamic> json) => Trial(
        id: json['id'] as String,
        scheduledAt: DateTime.tryParse(json['scheduledAt'] as String? ?? '')
                ?.toLocal() ??
            DateTime.now(),
        durationMinutes: (json['durationMinutes'] as num?)?.toInt() ?? 60,
        place: json['place'] as String?,
        placeLabel: json['placeLabel'] as String?,
        placeNote: json['placeNote'] as String?,
        studentCount: (json['studentCount'] as num?)?.toInt(),
        status: TrialStatus.parse(json['status'] as String?),
        proposedBy: json['proposedBy'] as String? ?? '',
        iProposed: json['iProposed'] as bool? ?? false,
        seekerOutcome: TrialOutcome.parse(json['seekerOutcome'] as String?),
        providerOutcome: TrialOutcome.parse(json['providerOutcome'] as String?),
        myOutcome: TrialOutcome.parse(json['myOutcome'] as String?),
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );
}
