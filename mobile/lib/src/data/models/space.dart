/// A coach's Space — the page a family reads while deciding.
///
/// `iFollow`, `isMine` and `suspendedReason` are answers about the caller, not
/// facts about the Space, and the service resolves all three. A guest gets
/// false, false and null; only the owner is told why theirs was taken down.
library;

class Space {
  const Space({
    required this.id,
    required this.providerId,
    required this.displayName,
    required this.photoUrl,
    required this.headline,
    required this.about,
    required this.categoryName,
    required this.followerCount,
    required this.postCount,
    required this.iFollow,
    required this.isMine,
    required this.isSuspended,
    required this.suspendedReason,
  });

  /// The space's own id, which is not the provider's. Storage paths are keyed
  /// on this one, matching what the web writes.
  final String id;
  final String providerId;

  final String? displayName;
  final String? photoUrl;
  final String? headline;
  final String? about;
  final String? categoryName;
  final int followerCount;

  /// Hidden posts are not counted.
  final int postCount;

  final bool iFollow;
  final bool isMine;
  final bool isSuspended;

  /// The owner's business and nobody else's, so it is null to everyone else.
  final String? suspendedReason;

  factory Space.fromJson(Map<String, dynamic> json) => Space(
        id: json['id'] as String,
        providerId: json['providerId'] as String,
        displayName: json['displayName'] as String?,
        photoUrl: json['photoUrl'] as String?,
        headline: json['headline'] as String?,
        about: json['about'] as String?,
        categoryName: json['categoryName'] as String?,
        followerCount: (json['followerCount'] as num?)?.toInt() ?? 0,
        postCount: (json['postCount'] as num?)?.toInt() ?? 0,
        iFollow: json['iFollow'] as bool? ?? false,
        isMine: json['isMine'] as bool? ?? false,
        isSuspended: json['isSuspended'] as bool? ?? false,
        suspendedReason: json['suspendedReason'] as String?,
      );
}

/// The three reactions a post can carry. Sending the same one again is not a
/// toggle as far as the service is concerned — the client decides that.
enum Reaction {
  like('like', 'Like'),
  wow('wow', 'Wow'),
  surprise('surprise', 'Surprise');

  const Reaction(this.id, this.label);

  final String id;
  final String label;

  static Reaction? parse(String? value) {
    for (final r in Reaction.values) {
      if (r.id == value) return r;
    }
    return null;
  }
}

class SpacePost {
  const SpacePost({
    required this.id,
    required this.kind,
    required this.body,
    required this.imageUrl,
    required this.youtubeId,
    required this.createdAt,
    required this.isHidden,
    required this.hiddenReason,
    required this.likes,
    required this.wows,
    required this.surprises,
    required this.myReaction,
    required this.iReported,
  });

  final String id;

  /// 'photo' or 'video'.
  final String kind;

  final String? body;
  final String? imageUrl;

  /// The 11-character YouTube id, never a URL.
  final String? youtubeId;

  final DateTime createdAt;

  /// A hidden post stays in the table — the report queue is about it, and
  /// deleting the evidence when a complaint arrives is the wrong instinct.
  /// Only the owner is served one.
  final bool isHidden;
  final String? hiddenReason;

  final int likes;
  final int wows;
  final int surprises;

  /// Counted server-side: space_reactions is readable only for your own rows,
  /// so a client counting them would report one.
  final Reaction? myReaction;

  final bool iReported;

  bool get isPhoto => kind == 'photo';
  bool get isVideo => kind == 'video';

  int countFor(Reaction r) => switch (r) {
        Reaction.like => likes,
        Reaction.wow => wows,
        Reaction.surprise => surprises,
      };

  /// The post as it reads after this device reacts, so the tap lands before
  /// the round trip does. The server is still the authority — a refusal
  /// re-reads the list.
  SpacePost withReaction(Reaction? next) {
    int adjust(Reaction r, int count) {
      var n = count;
      if (myReaction == r) n -= 1;
      if (next == r) n += 1;
      return n < 0 ? 0 : n;
    }

    return SpacePost(
      id: id,
      kind: kind,
      body: body,
      imageUrl: imageUrl,
      youtubeId: youtubeId,
      createdAt: createdAt,
      isHidden: isHidden,
      hiddenReason: hiddenReason,
      likes: adjust(Reaction.like, likes),
      wows: adjust(Reaction.wow, wows),
      surprises: adjust(Reaction.surprise, surprises),
      myReaction: next,
      iReported: iReported,
    );
  }

  factory SpacePost.fromJson(Map<String, dynamic> json) => SpacePost(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? 'photo',
        body: json['body'] as String?,
        imageUrl: json['imageUrl'] as String?,
        youtubeId: json['youtubeId'] as String?,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        isHidden: json['isHidden'] as bool? ?? false,
        hiddenReason: json['hiddenReason'] as String?,
        likes: (json['likes'] as num?)?.toInt() ?? 0,
        wows: (json['wows'] as num?)?.toInt() ?? 0,
        surprises: (json['surprises'] as num?)?.toInt() ?? 0,
        myReaction: Reaction.parse(json['myReaction'] as String?),
        iReported: json['iReported'] as bool? ?? false,
      );
}

/// The most a photo post may weigh, matching lib/spaces.ts. Checked before the
/// upload starts rather than after it fails — a coach on mobile data should
/// not send four megabytes to be told no.
const maxImageBytes = 5 * 1024 * 1024;

/// The YouTube id out of whatever somebody pasted.
///
/// A port of parseYouTubeId in lib/spaces.ts, pattern for pattern. The API
/// takes the 11-character id and nothing else, so this is what stands between
/// a pasted share link and a refusal.
String? parseYouTubeId(String input) {
  final raw = input.trim();
  if (raw.isEmpty) return null;

  // Already an id.
  if (RegExp(r'^[A-Za-z0-9_-]{11}$').hasMatch(raw)) return raw;

  final patterns = [
    RegExp(
        r'(?:youtube\.com|youtube-nocookie\.com)/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})'),
    RegExp(r'youtu\.be/([A-Za-z0-9_-]{11})'),
    RegExp(
        r'(?:youtube\.com|youtube-nocookie\.com)/shorts/([A-Za-z0-9_-]{11})'),
    RegExp(r'(?:youtube\.com|youtube-nocookie\.com)/embed/([A-Za-z0-9_-]{11})'),
    RegExp(r'(?:youtube\.com|youtube-nocookie\.com)/live/([A-Za-z0-9_-]{11})'),
  ];

  for (final pattern in patterns) {
    final match = pattern.firstMatch(raw);
    if (match != null) return match.group(1);
  }

  return null;
}
