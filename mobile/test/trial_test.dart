import 'package:aspire91/src/data/models/thread.dart';
import 'package:aspire91/src/data/models/trial.dart';
import 'package:flutter_test/flutter_test.dart';

/// Arranging a first class, and the four states the card branches on.
///
/// Every one of them decides which buttons a person is offered, so getting one
/// backwards offers a family the chance to confirm a time they suggested
/// themselves — or asks for an outcome on a class nobody agreed to.

Trial trial({
  String status = 'proposed',
  bool iProposed = true,
  DateTime? at,
  String? myOutcome,
}) =>
    Trial.fromJson({
      'id': 't1',
      'scheduledAt': (at ?? DateTime.now().add(const Duration(days: 2)))
          .toUtc()
          .toIso8601String(),
      'durationMinutes': 60,
      'place': 'own_centre',
      'placeLabel': 'At the centre',
      'placeNote': null,
      'studentCount': null,
      'status': status,
      'proposedBy': 'user-1',
      'iProposed': iProposed,
      'seekerOutcome': null,
      'providerOutcome': null,
      'myOutcome': myOutcome,
      'createdAt': '2026-09-12T10:00:00.000Z',
    });

void main() {
  group('who is waiting on whom', () {
    test('the one who suggested it waits', () {
      final t = trial(iProposed: true);
      expect(t.awaitingTheirAnswer, isTrue);
      expect(t.awaitingMyAnswer, isFalse);
    });

    test('the other side answers', () {
      final t = trial(iProposed: false);
      expect(t.awaitingMyAnswer, isTrue);
      expect(t.awaitingTheirAnswer, isFalse);
    });

    test('nobody waits once it is settled', () {
      for (final status in ['confirmed', 'declined']) {
        final t = trial(status: status, iProposed: false);
        expect(t.awaitingMyAnswer, isFalse, reason: status);
        expect(t.awaitingTheirAnswer, isFalse, reason: status);
      }
    });
  });

  group('what happened', () {
    final past = DateTime.now().subtract(const Duration(days: 1));
    final future = DateTime.now().add(const Duration(days: 1));

    test('is only asked about a confirmed class that has been', () {
      expect(trial(status: 'confirmed', at: past).needsOutcome, isTrue);
    });

    test('is not asked before it happens', () {
      expect(trial(status: 'confirmed', at: future).needsOutcome, isFalse);
    });

    test('is not asked about a time nobody agreed to', () {
      // Neither a suggestion nobody answered nor a declined one earns the
      // question, however long ago it was.
      expect(trial(status: 'proposed', at: past).isPast, isFalse);
      expect(trial(status: 'declined', at: past).needsOutcome, isFalse);
    });

    test('is not asked twice', () {
      final answered =
          trial(status: 'confirmed', at: past, myOutcome: 'happened');
      expect(answered.needsOutcome, isFalse);
      expect(answered.myOutcome, TrialOutcome.happened);
    });

    test('keeps the two sides apart', () {
      // A coach marking a no-show must not put that on the family's record.
      final t = Trial.fromJson({
        'id': 't1',
        'scheduledAt': '2026-09-10T10:00:00.000Z',
        'status': 'confirmed',
        'proposedBy': 'p1',
        'seekerOutcome': null,
        'providerOutcome': 'no_show',
        'myOutcome': 'no_show',
        'createdAt': '2026-09-01T10:00:00.000Z',
      });

      expect(t.providerOutcome, TrialOutcome.noShow);
      expect(t.seekerOutcome, isNull);
      expect(t.myOutcome, TrialOutcome.noShow);
    });
  });

  group('parsing', () {
    test('falls back rather than throwing on a status added later', () {
      expect(TrialStatus.parse('rescheduled'), TrialStatus.proposed);
      expect(TrialStatus.parse(null), TrialStatus.proposed);
      expect(TrialStatus.parse('confirmed'), TrialStatus.confirmed);
    });

    test('reads an unknown outcome as none rather than crashing', () {
      expect(TrialOutcome.parse('went_alright'), isNull);
      expect(TrialOutcome.parse(null), isNull);
      expect(TrialOutcome.parse('cancelled'), TrialOutcome.cancelled);
    });

    test('defaults an hour when no duration came back', () {
      final t = Trial.fromJson({
        'id': 't1',
        'scheduledAt': '2026-09-20T10:00:00.000Z',
        'proposedBy': 'p1',
        'createdAt': '2026-09-12T10:00:00.000Z',
      });
      expect(t.durationMinutes, 60);
    });

    test('brings the time into the phone local zone', () {
      // Stored as UTC, read where somebody actually is — a class at 17:00 must
      // not read as 11:30.
      final t = Trial.fromJson({
        'id': 't1',
        'scheduledAt': '2026-09-20T11:30:00.000Z',
        'proposedBy': 'p1',
        'createdAt': '2026-09-12T10:00:00.000Z',
      });
      expect(t.scheduledAt.isUtc, isFalse);
      expect(
        t.scheduledAt,
        DateTime.utc(2026, 9, 20, 11, 30).toLocal(),
      );
    });
  });

  group('the phone switch on a thread', () {
    Map<String, dynamic> row(Object? showPhone, String kind) => {
          'kind': kind,
          'threadId': 't1',
          'initiatedBy': 'provider',
          'createdAt': '2026-09-12T10:00:00.000Z',
          'messageCount': 0,
          'unread': false,
          'iAmSeeker': true,
          'showPhone': showPhone,
        };

    test('reads what the service says rather than assuming', () {
      // The control used to start at "not shared" whatever the truth was,
      // because the contract did not carry it.
      expect(Thread.fromJson(row(true, 'enquiry')).showPhone, isTrue);
      expect(Thread.fromJson(row(false, 'enquiry')).showPhone, isFalse);
    });

    test('is null on a group thread, which has no such switch', () {
      expect(Thread.fromJson(row(null, 'group')).showPhone, isNull);
    });
  });
}
