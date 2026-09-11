import 'package:aspire91/src/data/models/alerts.dart';
import 'package:aspire91/src/data/models/query.dart';
import 'package:aspire91/src/data/models/thread.dart';
import 'package:flutter_test/flutter_test.dart';

/// Leads, and the two things the app had to learn to show them.
///
/// A query is not a conversation — it is a parent waiting by a phone — so the
/// statuses decide which pile it sits in, and `unread` decides whether the tab
/// carries a number. Both are new, and both are easy to get backwards.

Map<String, dynamic> row({
  String status = 'new',
  bool unread = true,
  String? callbackAt,
  String? enquiryId,
}) =>
    {
      'id': 'q1',
      'providerId': 'p1',
      'providerName': 'Krishna',
      'seekerId': 's1',
      'contactName': 'Nivaan',
      'contactPhone': '+91 98765 43210',
      'serviceCategoryId': null,
      'serviceName': 'Boxing',
      'details': 'My son is 12 years old',
      'status': status,
      'callbackAt': callbackAt,
      'createdAt': '2026-09-03T10:00:00.000Z',
      'respondedAt': null,
      'enquiryId': enquiryId,
      'unread': unread,
    };

void main() {
  group('a query off the wire', () {
    test('maps every field the card renders', () {
      final q = Query.fromJson(row());
      expect(q.contactName, 'Nivaan');
      expect(q.contactPhone, '+91 98765 43210');
      expect(q.serviceName, 'Boxing');
      expect(q.details, 'My son is 12 years old');
      expect(q.unread, isTrue);
    });

    test('reads the conversation id once one exists', () {
      expect(Query.fromJson(row()).enquiryId, isNull);
      expect(Query.fromJson(row(enquiryId: 'e1')).enquiryId, 'e1');
    });

    test('reads a booked call time', () {
      final q = Query.fromJson(row(
        status: 'callback_scheduled',
        callbackAt: '2026-09-05T14:30:00.000Z',
      ));
      expect(q.callbackAt, isNotNull);
      expect(q.status, QueryStatus.callbackScheduled);
    });
  });

  group('status', () {
    test('splits the worklist from the finished pile', () {
      // The screen shows one or the other, so a status in the wrong half is a
      // lead that vanishes.
      expect(QueryStatus.isNew.isOpen, isTrue);
      expect(QueryStatus.contacted.isOpen, isTrue);
      expect(QueryStatus.callbackScheduled.isOpen, isTrue);
      expect(QueryStatus.completed.isOpen, isFalse);
      expect(QueryStatus.closed.isOpen, isFalse);
    });

    test('carries the same words the web uses', () {
      expect(QueryStatus.callbackScheduled.label, 'Call booked');
      expect(QueryStatus.isNew.label, 'New');
    });

    test('falls back rather than throwing on a status added later', () {
      expect(QueryStatus.parse('invented_later'), QueryStatus.isNew);
      expect(QueryStatus.parse(null), QueryStatus.isNew);
      expect(QueryStatus.parse('closed'), QueryStatus.closed);
    });
  });

  group('where a thread came from', () {
    Map<String, dynamic> thread(Object? origin) => {
          'kind': 'enquiry',
          'threadId': 't1',
          'initiatedBy': 'provider',
          'createdAt': '2026-09-03T10:00:00.000Z',
          'messageCount': 5,
          'unread': false,
          'iAmSeeker': false,
          'origin': origin,
        };

    test('is null on a conversation that did not start with a call request',
        () {
      expect(Thread.fromJson(thread(null)).origin, isNull);
    });

    test('carries what the line needs to say', () {
      final t = Thread.fromJson(thread({
        'queryId': 'q1',
        'serviceName': 'Boxing',
        'askedAt': '2026-09-03T10:00:00.000Z',
      }));

      expect(t.origin, isNotNull);
      expect(t.origin!.serviceName, 'Boxing');
      expect(t.origin!.askedAt.day, 3);
    });

    test('survives a query with no service on it', () {
      // serviceCategoryId is optional on the request, so the line has to read
      // without it — "They asked for a call on 3 Sept".
      final t = Thread.fromJson(thread({
        'queryId': 'q1',
        'serviceName': null,
        'askedAt': '2026-09-03T10:00:00.000Z',
      }));

      expect(t.origin!.serviceName, isNull);
    });
  });

  group('alerts', () {
    test('carries the query counter the badge reads', () {
      final a = Alerts.fromJson({'unreadQueries': 3, 'needsYou': 5});
      expect(a.unreadQueries, 3);
      expect(a.needsYou, 5);
    });

    test('is all zeroes when nothing is waiting', () {
      // A badge reads the number and hides itself at zero, so a client never
      // branches on "no alerts yet".
      expect(Alerts.none.unreadQueries, 0);
      expect(Alerts.fromJson(const {}).unreadQueries, 0);
    });

    test('coerces a bigint that arrived as a string', () {
      expect(Alerts.fromJson({'unreadQueries': '7'}).unreadQueries, 7);
    });
  });
}
