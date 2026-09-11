/// What is waiting on the caller. One read behind every badge.
///
/// `needsYou` is not the sum of the rest — it counts unread notifications of
/// the kinds that want an action, which is the number a bell should carry.
class Alerts {
  const Alerts({
    required this.pendingPitches,
    required this.groupsNeedingMembers,
    required this.acceptedPitches,
    required this.pendingApproaches,
    required this.unreadThreads,
    required this.unansweredEnquiries,
    required this.needsYou,
  });

  final int pendingPitches;
  final int groupsNeedingMembers;
  final int acceptedPitches;
  final int pendingApproaches;
  final int unreadThreads;
  final int unansweredEnquiries;
  final int needsYou;

  static const none = Alerts(
    pendingPitches: 0,
    groupsNeedingMembers: 0,
    acceptedPitches: 0,
    pendingApproaches: 0,
    unreadThreads: 0,
    unansweredEnquiries: 0,
    needsYou: 0,
  );

  static int _n(dynamic v) =>
      v == null ? 0 : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

  factory Alerts.fromJson(Map<String, dynamic> json) => Alerts(
        pendingPitches: _n(json['pendingPitches']),
        groupsNeedingMembers: _n(json['groupsNeedingMembers']),
        acceptedPitches: _n(json['acceptedPitches']),
        pendingApproaches: _n(json['pendingApproaches']),
        unreadThreads: _n(json['unreadThreads']),
        unansweredEnquiries: _n(json['unansweredEnquiries']),
        needsYou: _n(json['needsYou']),
      );
}
