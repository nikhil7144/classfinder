/// What makes a family's profile complete.
///
/// A port of getSeekerProfileFieldErrors and getRequirementErrors in
/// lib/profile-rules.ts and lib/requirements.ts. Duplicated for the same
/// reason listing_rules.dart is: the answer has to be known while somebody is
/// typing, and a round trip per keystroke is not a way to run a form.
///
/// The database is still the floor. These exist so a parent is told what is
/// missing before they press save, not so the client decides anything.
library;

import 'models/seeker.dart';

/// The sections of the form, in the order they are shown.
enum SeekerSection { about, requirement }

class SeekerProblem {
  const SeekerProblem(this.section, this.message);

  final SeekerSection section;
  final String message;
}

/// Everything still missing or wrong. Empty means the profile is complete.
///
/// `phone` is passed in rather than read from the profile: it lives on
/// `profiles`, not `seekers`, and is saved by a different call.
List<SeekerProblem> seekerProblems(SeekerProfile p, {String? phone}) {
  final problems = <SeekerProblem>[];
  void add(SeekerSection s, String m) => problems.add(SeekerProblem(s, m));

  bool has(String? v) => v != null && v.trim().isNotEmpty;

  // --- Who you are ---------------------------------------------------------
  if (!has(p.name)) add(SeekerSection.about, 'Your name is required.');
  if (!has(phone)) add(SeekerSection.about, 'A mobile number is required.');
  if (p.areaId == null) {
    add(SeekerSection.about, "Choose the area you're looking in.");
  }
  if (!has(p.relationToLearner)) {
    add(SeekerSection.about, "Tell us who you're looking for.");
  }

  // --- What you want -------------------------------------------------------
  //
  // Only required of somebody who has asked to be found. The web's comment
  // says it plainly: "a parent who just wants to browse and message owes us
  // nothing." Getting this backwards would demand a requirement from someone
  // who only wants to read.
  if (p.openToOffers && p.lookingFor.isEmpty) {
    add(SeekerSection.requirement,
        "Pick at least one thing you're looking for.");
  }

  final ageText = p.learnerAge.trim();
  if (ageText.isNotEmpty) {
    final age = int.tryParse(ageText);
    if (age == null || age < 2 || age > 99) {
      add(SeekerSection.requirement, 'Enter an age between 2 and 99.');
    }
  }

  final minText = p.budgetMin.trim();
  final maxText = p.budgetMax.trim();
  final min = minText.isEmpty ? null : num.tryParse(minText);
  final max = maxText.isEmpty ? null : num.tryParse(maxText);

  if ((minText.isNotEmpty && min == null) ||
      (maxText.isNotEmpty && max == null)) {
    add(SeekerSection.requirement, 'Budget must be a number.');
  } else if (min != null && max != null && max < min) {
    add(SeekerSection.requirement,
        "The upper budget can't be lower than the lower one.");
  } else if ((min != null || max != null) && !has(p.budgetPeriod)) {
    add(SeekerSection.requirement, 'Choose what the budget is per.');
  }

  return problems;
}

/// The sections that still have something wrong in them.
Set<SeekerSection> seekerSectionsWithProblems(SeekerProfile p,
        {String? phone}) =>
    seekerProblems(p, phone: phone).map((e) => e.section).toSet();
