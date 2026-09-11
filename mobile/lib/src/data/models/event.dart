/// An event a coach or an event company is running.
///
/// Owned by exactly one of the two, which is why `ownerKind` is reported
/// rather than left for a client to infer from whichever id is null.
///
/// Mutable, like Listing and for the same reason: it is what the create and
/// edit form binds to, and copying an immutable model on every keystroke buys
/// nothing for a screen that owns the only instance.
library;

const bookingModes = <String, String>{
  'platform': 'Take entries here',
  'external': 'Send them to my own site',
  'none': 'Just announcing it',
};

const entryTypes = <String, String>{
  'individual': 'One child',
  'team': 'A team',
};

enum EventStatus {
  draft('draft', 'Draft'),
  published('published', 'Published'),
  cancelled('cancelled', 'Cancelled'),
  completed('completed', 'Completed');

  const EventStatus(this.id, this.label);

  final String id;
  final String label;

  /// Families can see it. Draft is nobody's but the owner's.
  bool get isLive => this == published;

  static EventStatus parse(String? value) {
    for (final s in EventStatus.values) {
      if (s.id == value) return s;
    }
    return EventStatus.draft;
  }
}

/// What a family actually enters — the row carrying a price and a number of
/// places.
///
/// Per category rather than per event because most competitions carry both an
/// under-10 singles and an under-14 team, at different fees and capacities.
class EventCategory {
  EventCategory({
    this.id,
    this.name = '',
    this.entryType = 'individual',
    this.teamSize,
    this.capacity,
    this.entriesCount = 0,
    this.feeAmount = '',
    this.minAge = '',
    this.maxAge = '',
    this.sortOrder = 0,
  });

  /// Present means edit that row, absent means add one — which is what lets a
  /// category keep its id, and therefore its entries, across a save.
  final String? id;

  String name;
  String entryType;

  /// Set for a team, null otherwise. The database has a check constraint on
  /// this pair, so the form keeps them consistent rather than being told.
  String? teamSize;

  /// Null means uncapped.
  String? capacity;

  /// Confirmed entries. A column on the row, not a count — RLS hides other
  /// families' entries, so anything counting as the caller would count one.
  final int entriesCount;

  // Held as typed text, parsed once on save. Same reason as Listing.
  String feeAmount;
  String minAge;
  String maxAge;

  int sortOrder;

  bool get isTeam => entryType == 'team';
  bool get isFull =>
      capacity != null &&
      (int.tryParse(capacity!) ?? 0) > 0 &&
      entriesCount >= (int.tryParse(capacity!) ?? 0);

  factory EventCategory.fromJson(Map<String, dynamic> json) {
    String num$(Object? v) => v == null ? '' : '$v';
    return EventCategory(
      id: json['id'] as String?,
      name: json['name'] as String? ?? '',
      entryType: json['entryType'] as String? ?? 'individual',
      teamSize: json['teamSize'] == null ? null : '${json['teamSize']}',
      capacity: json['capacity'] == null ? null : '${json['capacity']}',
      entriesCount: (json['entriesCount'] as num?)?.toInt() ?? 0,
      feeAmount: num$(json['feeAmount']),
      minAge: num$(json['minAge']),
      maxAge: num$(json['maxAge']),
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    int? parse(String? raw) =>
        raw == null || raw.trim().isEmpty ? null : int.tryParse(raw.trim());

    return {
      if (id != null) 'id': id,
      'name': name.trim(),
      'entryType': entryType,
      // Only a team carries a size; sending one for an individual is what the
      // check constraint refuses.
      if (isTeam && parse(teamSize) != null) 'teamSize': parse(teamSize),
      if (parse(capacity) != null) 'capacity': parse(capacity),
      if (parse(feeAmount) != null) 'feeAmount': parse(feeAmount),
      if (parse(minAge) != null) 'minAge': parse(minAge),
      if (parse(maxAge) != null) 'maxAge': parse(maxAge),
      'sortOrder': sortOrder,
    };
  }
}

class Event {
  Event({
    this.id,
    this.ownerKind = 'provider',
    this.ownerId,
    this.ownerName,
    this.title = '',
    this.about = '',
    this.serviceCategoryId,
    this.bannerUrl,
    this.cityId,
    this.venueName = '',
    this.venueAddress = '',
    this.bookingMode = 'platform',
    this.externalBookingUrl = '',
    this.bookingOpensAt,
    this.bookingClosesAt,
    this.cancellationDeadline,
    DateTime? startsAt,
    this.endsAt,
    this.status = EventStatus.draft,
    DateTime? createdAt,
    List<EventCategory>? categories,
  })  : startsAt = startsAt ?? _defaultStart(),
        createdAt = createdAt ?? DateTime.now(),
        categories = categories ?? [];

  /// A week out, at 9am — far enough that the date picker is not arguing with
  /// a time already past.
  static DateTime _defaultStart() {
    final d = DateTime.now().add(const Duration(days: 7));
    return DateTime(d.year, d.month, d.day, 9);
  }

  /// Null until the first save.
  final String? id;

  final String ownerKind;
  final String? ownerId;
  final String? ownerName;

  String title;
  String about;
  String? serviceCategoryId;
  String? bannerUrl;

  /// Where it is. Required to create, which is why it is nullable here and
  /// checked before saving rather than defaulted to somebody else's city.
  String? cityId;

  String venueName;
  String venueAddress;

  /// Stated, never inferred from whether a URL is set: platform takes entries
  /// here, external sends them elsewhere, none is an announcement.
  String bookingMode;
  String externalBookingUrl;

  DateTime? bookingOpensAt;
  DateTime? bookingClosesAt;

  /// After this a family can no longer withdraw itself. Its own field because
  /// "no withdrawals in the last week" cannot be said by closing entries early.
  DateTime? cancellationDeadline;

  DateTime startsAt;
  DateTime? endsAt;

  final EventStatus status;
  final DateTime createdAt;

  List<EventCategory> categories;

  bool get takesEntriesHere => bookingMode == 'platform';

  /// Everyone who has entered, across every category.
  int get entriesCount => categories.fold(0, (sum, c) => sum + c.entriesCount);

  factory Event.fromJson(Map<String, dynamic> json) {
    DateTime? date(Object? v) =>
        v == null ? null : DateTime.tryParse(v as String);

    return Event(
      id: json['id'] as String?,
      ownerKind: json['ownerKind'] as String? ?? 'provider',
      ownerId: json['ownerId'] as String?,
      ownerName: json['ownerName'] as String?,
      title: json['title'] as String? ?? '',
      about: json['about'] as String? ?? '',
      serviceCategoryId: json['serviceCategoryId'] as String?,
      bannerUrl: json['bannerUrl'] as String?,
      cityId: json['cityId'] as String?,
      venueName: json['venueName'] as String? ?? '',
      venueAddress: json['venueAddress'] as String? ?? '',
      bookingMode: json['bookingMode'] as String? ?? 'platform',
      externalBookingUrl: json['externalBookingUrl'] as String? ?? '',
      bookingOpensAt: date(json['bookingOpensAt']),
      bookingClosesAt: date(json['bookingClosesAt']),
      cancellationDeadline: date(json['cancellationDeadline']),
      startsAt: date(json['startsAt']),
      endsAt: date(json['endsAt']),
      status: EventStatus.parse(json['status'] as String?),
      createdAt: date(json['createdAt']),
      categories: ((json['categories'] as List?) ?? const [])
          .map((e) => EventCategory.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// The event itself. Categories are a separate endpoint — they are replaced
  /// as a set, and folding them in here would mean an edit to the title
  /// rewrote every category row.
  Map<String, dynamic> toSaveJson() {
    String? text(String raw) => raw.trim().isEmpty ? null : raw.trim();
    String? iso(DateTime? at) => at?.toUtc().toIso8601String();

    return {
      'title': title.trim(),
      'about': text(about),
      'serviceCategoryId': serviceCategoryId,
      'bannerUrl': bannerUrl,
      'cityId': cityId,
      'venueName': text(venueName),
      'venueAddress': text(venueAddress),
      'bookingMode': bookingMode,
      // Only meaningful when entries go elsewhere; the validator refuses a
      // string that is not a URL, so an empty one must not be sent.
      'externalBookingUrl':
          bookingMode == 'external' ? text(externalBookingUrl) : null,
      'bookingOpensAt': iso(bookingOpensAt),
      'bookingClosesAt': iso(bookingClosesAt),
      'cancellationDeadline': iso(cancellationDeadline),
      'startsAt': iso(startsAt),
      'endsAt': iso(endsAt),
    }..removeWhere((_, value) => value == null);
  }
}
