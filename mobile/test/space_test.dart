import 'package:aspire91/src/data/models/space.dart';
import 'package:flutter_test/flutter_test.dart';

/// The two pieces of Space logic that are not just plumbing.
///
/// `parseYouTubeId` is a port of the same function in lib/spaces.ts, and it is
/// what stands between a pasted share link and the API refusing anything that
/// is not an 11-character id. `withReaction` is the arithmetic behind the
/// optimistic tap — it runs before the server is asked, so being wrong shows.

SpacePost post({
  int likes = 0,
  int wows = 0,
  int surprises = 0,
  Reaction? mine,
}) =>
    SpacePost(
      id: 'p1',
      kind: 'photo',
      body: null,
      imageUrl: 'https://example.test/a.jpg',
      youtubeId: null,
      createdAt: DateTime(2026, 9, 1),
      isHidden: false,
      hiddenReason: null,
      likes: likes,
      wows: wows,
      surprises: surprises,
      myReaction: mine,
      iReported: false,
    );

void main() {
  group('parseYouTubeId', () {
    test('takes a bare id unchanged', () {
      expect(parseYouTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    test('reads every link shape YouTube hands out', () {
      const cases = {
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ': 'dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
        'https://www.youtube.com/live/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
      };

      cases.forEach((input, expected) {
        expect(parseYouTubeId(input), expected, reason: input);
      });
    });

    test('finds the id when the share link carries other parameters', () {
      // What the Android share sheet actually produces.
      expect(
        parseYouTubeId(
            'https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ&t=42s'),
        'dQw4w9WgXcQ',
      );
    });

    test('tolerates the whitespace a paste brings with it', () {
      expect(parseYouTubeId('  https://youtu.be/dQw4w9WgXcQ  '), 'dQw4w9WgXcQ');
    });

    test('refuses things that are not a video', () {
      for (final input in [
        '',
        '   ',
        'https://vimeo.com/76979871',
        'https://www.youtube.com/',
        'have a look at this',
      ]) {
        expect(parseYouTubeId(input), isNull, reason: input);
      }
    });
  });

  group('withReaction', () {
    test('adds one when nothing was given before', () {
      final next = post(likes: 4).withReaction(Reaction.like);
      expect(next.likes, 5);
      expect(next.myReaction, Reaction.like);
    });

    test('takes it back, because the service does not toggle', () {
      final next = post(likes: 5, mine: Reaction.like).withReaction(null);
      expect(next.likes, 4);
      expect(next.myReaction, isNull);
    });

    test('moves the count when the reaction changes', () {
      final next = post(likes: 5, wows: 2, mine: Reaction.like)
          .withReaction(Reaction.wow);
      expect(next.likes, 4);
      expect(next.wows, 3);
      expect(next.myReaction, Reaction.wow);
    });

    test('leaves the reaction that was not touched alone', () {
      final next =
          post(likes: 1, wows: 2, surprises: 3).withReaction(Reaction.surprise);
      expect(next.likes, 1);
      expect(next.wows, 2);
      expect(next.surprises, 4);
    });

    test('never goes below zero', () {
      // The counts come from the server. If they ever disagree with what this
      // device thinks it gave, a negative count on screen is the worse bug.
      final next = post(mine: Reaction.like).withReaction(null);
      expect(next.likes, 0);
    });

    test('carries the rest of the post through untouched', () {
      final next = post(likes: 1).withReaction(Reaction.like);
      expect(next.id, 'p1');
      expect(next.imageUrl, 'https://example.test/a.jpg');
      expect(next.createdAt, DateTime(2026, 9, 1));
    });
  });

  test('a post knows which kind it is', () {
    expect(post().isPhoto, isTrue);
    expect(post().isVideo, isFalse);
  });

  test('an unknown reaction from the server does not throw', () {
    // A reaction added after this shipped reads as none rather than crashing
    // the whole feed.
    expect(Reaction.parse('applause'), isNull);
    expect(Reaction.parse(null), isNull);
    expect(Reaction.parse('wow'), Reaction.wow);
  });
}
