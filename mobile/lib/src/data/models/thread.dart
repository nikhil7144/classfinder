/// One conversation in the inbox, from either side of it.
///
/// my_threads() unions two things that read alike: a coach pitching a group of
/// neighbours, and a family enquiring with a coach. `title`, `subtitle`,
/// `unread` and `iAmSeeker` are all resolved for whoever asked, so the same
/// thread reads differently to the two people in it — which is why none of
/// that is computed here.
class Thread {
  const Thread({
    required this.kind,
    required this.threadId,
    required this.groupId,
    required this.providerId,
    required this.title,
    required this.subtitle,
    required this.photoUrl,
    required this.opening,
    required this.status,
    required this.initiatedBy,
    required this.createdAt,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.lastSenderId,
    required this.messageCount,
    required this.unread,
    required this.iAmSeeker,
    required this.showPhone,
    required this.origin,
  });

  /// 'group' or 'enquiry'. It decides which table the messages live in, which
  /// the API hides — but a client still names it, because the two are
  /// different conversations to a reader.
  final String kind;

  /// Unique within its kind and not across both. Pair them for a key.
  final String threadId;

  final String? groupId;
  final String? providerId;
  final String? title;
  final String? subtitle;
  final String? photoUrl;
  final String? opening;
  final String? status;
  final String initiatedBy;
  final DateTime createdAt;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final String? lastSenderId;
  final int messageCount;
  final bool unread;
  final bool iAmSeeker;

  /// Whether this family's number is shared with the coach. Null on a group
  /// thread, which has no such switch — false would read as "not shared" on
  /// something that cannot be.
  final bool? showPhone;

  /// Set when this conversation began with a request for a call. A message
  /// from somebody you never wrote to is what makes contact feel unsolicited,
  /// so the thread says which request produced it.
  final QueryOrigin? origin;

  /// A coach's approach that the family has not answered. While it is pending
  /// the coach cannot write again — the composer is closed, and says so.
  bool get awaitingReply => status == 'pending';

  /// The last thing that happened, for sorting and for the timestamp shown.
  DateTime get lastActivity => lastMessageAt ?? createdAt;

  factory Thread.fromJson(Map<String, dynamic> json) => Thread(
        kind: json['kind'] as String,
        threadId: json['threadId'] as String,
        groupId: json['groupId'] as String?,
        providerId: json['providerId'] as String?,
        title: json['title'] as String?,
        subtitle: json['subtitle'] as String?,
        photoUrl: json['photoUrl'] as String?,
        opening: json['opening'] as String?,
        status: json['status'] as String?,
        initiatedBy: json['initiatedBy'] as String? ?? 'seeker',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        lastMessage: json['lastMessage'] as String?,
        lastMessageAt: json['lastMessageAt'] == null
            ? null
            : DateTime.tryParse(json['lastMessageAt'] as String),
        lastSenderId: json['lastSenderId'] as String?,
        messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
        unread: json['unread'] as bool? ?? false,
        iAmSeeker: json['iAmSeeker'] as bool? ?? false,
        showPhone: json['showPhone'] as bool?,
        origin: json['origin'] == null
            ? null
            : QueryOrigin.fromJson(json['origin'] as Map<String, dynamic>),
      );
}

/// Where a conversation came from, when it came from a request for a call.
class QueryOrigin {
  const QueryOrigin({
    required this.queryId,
    required this.serviceName,
    required this.askedAt,
  });

  final String queryId;
  final String? serviceName;

  /// When they asked, not when the coach replied.
  final DateTime askedAt;

  factory QueryOrigin.fromJson(Map<String, dynamic> json) => QueryOrigin(
        queryId: json['queryId'] as String,
        serviceName: json['serviceName'] as String?,
        askedAt: DateTime.tryParse(json['askedAt'] as String? ?? '') ??
            DateTime.now(),
      );
}

/// One message. The same shape whichever table it came from.
class Message {
  const Message({
    required this.id,
    required this.threadId,
    required this.senderId,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final String threadId;
  final String senderId;
  final String body;
  final DateTime createdAt;

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'] as String,
        threadId: json['threadId'] as String? ?? '',
        senderId: json['senderId'] as String,
        body: json['body'] as String? ?? '',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );

  /// Built from a Realtime row, which arrives snake_cased and straight from the
  /// table rather than through the API's mapper.
  factory Message.fromRealtime(Map<String, dynamic> row) => Message(
        id: row['id'] as String,
        threadId: (row['request_id'] ?? row['enquiry_id'] ?? '') as String,
        senderId: row['sender_id'] as String,
        body: row['body'] as String? ?? '',
        createdAt: DateTime.tryParse(row['created_at'] as String? ?? '') ??
            DateTime.now(),
      );
}
