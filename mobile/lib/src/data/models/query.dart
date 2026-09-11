/// A parent asking to be rung about a particular coach.
///
/// Not an enquiry. An enquiry is a conversation; this is a lead a coach works
/// through — rang them, calling back Tuesday, went nowhere. The two are linked
/// rather than merged: answering one opens an enquiry carrying `queryId`, so
/// the parent can see why a coach is suddenly writing to them.
library;

enum QueryStatus {
  isNew('new', 'New'),
  contacted('contacted', 'Contacted'),
  callbackScheduled('callback_scheduled', 'Call booked'),
  completed('completed', 'Completed'),
  closed('closed', 'Closed');

  const QueryStatus(this.id, this.label);

  final String id;
  final String label;

  /// Still on the worklist. Completed and closed are the other half.
  bool get isOpen =>
      this == isNew || this == contacted || this == callbackScheduled;

  /// A status added after this shipped reads as 'new' rather than throwing —
  /// a lead in the wrong column beats a screen that will not render.
  static QueryStatus parse(String? value) {
    for (final s in QueryStatus.values) {
      if (s.id == value) return s;
    }
    return QueryStatus.isNew;
  }
}

class Query {
  const Query({
    required this.id,
    required this.providerId,
    required this.providerName,
    required this.seekerId,
    required this.contactName,
    required this.contactPhone,
    required this.serviceCategoryId,
    required this.serviceName,
    required this.details,
    required this.status,
    required this.callbackAt,
    required this.createdAt,
    required this.respondedAt,
    required this.enquiryId,
    required this.unread,
  });

  final String id;
  final String providerId;

  /// The coach's name, for a parent's list. A coach reading their own leads
  /// wants contactName instead.
  final String? providerName;

  final String seekerId;

  /// As given when the query was raised, not as the profile reads now — a
  /// parent may leave a different name and number for a call.
  final String contactName;

  /// Only ever visible to the two parties. The point of the whole thing.
  final String contactPhone;

  final String? serviceCategoryId;
  final String? serviceName;
  final String? details;
  final QueryStatus status;

  /// When the call is booked for. Set only while the status says so.
  final DateTime? callbackAt;

  final DateTime createdAt;
  final DateTime? respondedAt;

  /// The conversation this query produced, once one exists.
  final String? enquiryId;

  /// Whether the caller has looked at it. Resolved for whoever asked — the two
  /// sides have their own read column.
  final bool unread;

  factory Query.fromJson(Map<String, dynamic> json) => Query(
        id: json['id'] as String,
        providerId: json['providerId'] as String,
        providerName: json['providerName'] as String?,
        seekerId: json['seekerId'] as String? ?? '',
        contactName: json['contactName'] as String? ?? '',
        contactPhone: json['contactPhone'] as String? ?? '',
        serviceCategoryId: json['serviceCategoryId'] as String?,
        serviceName: json['serviceName'] as String?,
        details: json['details'] as String?,
        status: QueryStatus.parse(json['status'] as String?),
        callbackAt: json['callbackAt'] == null
            ? null
            : DateTime.tryParse(json['callbackAt'] as String),
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        respondedAt: json['respondedAt'] == null
            ? null
            : DateTime.tryParse(json['respondedAt'] as String),
        enquiryId: json['enquiryId'] as String?,
        unread: json['unread'] as bool? ?? false,
      );
}
