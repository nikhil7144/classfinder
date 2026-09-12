/// Entering an event: the wording, the checks, and the date.
///
/// A port of formatAges and formatCapacity in lib/events.ts, and of the three
/// checks the web's entry form makes before it posts. Here rather than in the
/// screen for the reason listing_rules.dart and seeker_rules.dart exist: the
/// answer is needed while somebody is typing, and because this particular form
/// takes a child's name and date of birth, the rules around it are worth
/// reading — and testing — in one place rather than spread through a widget.
library;

/// "Ages 12–14", "Under 15", "12 and over", or nothing when the category is
/// open to everybody.
String? formatAges(String minAge, String maxAge) {
  final min = int.tryParse(minAge);
  final max = int.tryParse(maxAge);
  if (min != null && max != null) return 'Ages $min–$max';
  if (max != null) return 'Under ${max + 1}';
  if (min != null) return '$min and over';
  return null;
}

/// "12 of 40 taken", "Full", or what there is to say when it is uncapped.
String formatCapacity(String capacity, int entriesCount) {
  final cap = int.tryParse(capacity);
  if (cap == null) {
    return entriesCount > 0 ? '$entriesCount entered' : 'Open entry';
  }
  if (entriesCount >= cap) return 'Full';
  return '$entriesCount of $cap taken';
}

/// What is still wrong with an entry, in the web's order and its words, or
/// null when it is ready to send.
///
/// The consent check is last on purpose: it is the one a reader has to act on
/// deliberately, and telling them about it before their child's name is typed
/// would be telling them off for not having finished.
String? entryProblem({
  required String participantName,
  required List<String> memberNames,
  required bool consent,
}) {
  if (participantName.trim().length < 2) return 'Who is taking part?';
  if (memberNames.any((n) => n.trim().length < 2)) {
    return 'Every player in the team needs a name.';
  }
  if (!consent) return 'Please confirm the line above before entering.';
  return null;
}

/// How many more names a team entry needs. The entrant is one of them, so a
/// team of four asks for three.
int teamMatesNeeded({required bool isTeam, required String teamSize}) {
  if (!isTeam) return 0;
  final size = int.tryParse(teamSize) ?? 1;
  return (size - 1).clamp(0, 29);
}

/// A date with no time on it.
///
/// A birthday has no hour. Sending one — and with it whatever offset the phone
/// is in — is a bug waiting to move a child across an age band by a day.
String isoDate(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';
