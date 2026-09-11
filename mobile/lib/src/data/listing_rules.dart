/// What makes a listing complete.
///
/// A port of lib/profile-rules.ts, rule for rule. It is duplicated rather than
/// fetched because the answer has to be known while somebody is typing, and a
/// round trip per keystroke is not a way to run a form.
///
/// Duplication is the cost. The mitigation is that the two files are ordered
/// the same and named the same, so a rule added to one is findable in the
/// other — and the real floor is the database, which refuses a bad listing
/// whatever either client believes.
library;

import 'models/listing.dart';

const feePeriods = <String, String>{
  'per_hour': 'per hour',
  'per_session': 'per session',
  'per_month': 'per month',
  'per_course': 'per course',
};

const weekDays = <String, String>{
  'mon': 'Mon',
  'tue': 'Tue',
  'wed': 'Wed',
  'thu': 'Thu',
  'fri': 'Fri',
  'sat': 'Sat',
  'sun': 'Sun',
};

/// The sections of the form, in the order they are shown. A section with a
/// problem in it gets a marker, so somebody scrolling knows where to go back
/// to without reading every field.
enum ListingSection { about, teaching, where, fees, availability, proof }

/// One thing that is not finished yet, and where it is.
class ListingProblem {
  const ListingProblem(this.section, this.message);

  final ListingSection section;
  final String message;
}

/// Everything still missing or wrong. Empty means the listing is complete.
///
/// `phone` is passed in rather than read from the listing: it lives on the
/// profile, not the provider row, and is saved by a different call.
List<ListingProblem> listingProblems(Listing l, {String? phone}) {
  final problems = <ListingProblem>[];
  void add(ListingSection s, String m) => problems.add(ListingProblem(s, m));

  bool has(String? v) => v != null && v.trim().isNotEmpty;

  // Event planners run events and are never surfaced in coach search, so the
  // whole teaching half of the form does not apply to them.
  final planner = l.isEventPlanner;

  // --- About ---------------------------------------------------------------
  if (!planner && l.providerCategoryId == null) {
    add(ListingSection.about, 'Choose the category that describes you.');
  }
  if (!has(l.displayName)) {
    add(ListingSection.about, 'Your name is required.');
  }
  if (!has(l.bio)) {
    add(ListingSection.about, 'Write a short bio.');
  }
  if (!has(phone)) {
    add(ListingSection.about, 'A mobile number is required.');
  }
  if (!planner && !has(l.helpStatement)) {
    add(ListingSection.about, 'Tell parents how you help your students.');
  }

  final age = int.tryParse(l.age.trim());
  if (l.age.trim().isNotEmpty && age == null) {
    add(ListingSection.about, 'Age must be a whole number.');
  } else if (age != null && (age < 16 || age > 100)) {
    add(ListingSection.about, 'Age must be between 16 and 100.');
  }

  // --- Teaching ------------------------------------------------------------
  final experience = int.tryParse(l.experienceYears.trim());
  if (l.experienceYears.trim().isNotEmpty && experience == null) {
    add(ListingSection.teaching, 'Experience must be a whole number of years.');
  } else if (experience != null && (experience < 0 || experience > 70)) {
    add(ListingSection.teaching, 'Experience must be between 0 and 70 years.');
  } else if (experience == null && !planner) {
    add(ListingSection.teaching, 'Years of experience is required.');
  }

  if (l.serviceCategoryIds.isEmpty) {
    add(ListingSection.teaching, 'Select at least one thing you teach.');
  }
  if (!planner && l.teachingPlaces.isEmpty) {
    add(ListingSection.teaching, 'Select how you run your classes.');
  }

  // --- Where ---------------------------------------------------------------
  if (!planner && !l.isInstitution && l.travelsToStudents == null) {
    add(ListingSection.where, 'Say whether you travel to students.');
  }

  if (l.isInstitution) {
    final branches = l.branches.where((b) => !b.isBlank).toList();
    if (branches.isEmpty) {
      add(ListingSection.where, 'Add at least one branch.');
    } else {
      if (branches.any((b) => b.label.trim().isEmpty)) {
        add(ListingSection.where, 'Every branch needs a name.');
      }
      if (branches.any((b) => b.address.trim().isEmpty)) {
        add(ListingSection.where, 'Every branch needs an address.');
      }
      if (branches.any((b) => b.areaId == null)) {
        add(ListingSection.where, 'Every branch needs an area.');
      }
    }
  } else if (l.serviceAreaIds.isEmpty) {
    add(ListingSection.where, 'Select at least one area you serve.');
  }

  // --- Fees ----------------------------------------------------------------
  // Optional as a whole, but a half-filled range is a mistake worth catching.
  final feeMin = l.feeMin.trim().isEmpty ? null : num.tryParse(l.feeMin.trim());
  final feeMax = l.feeMax.trim().isEmpty ? null : num.tryParse(l.feeMax.trim());

  if ((l.feeMin.trim().isNotEmpty && feeMin == null) ||
      (l.feeMax.trim().isNotEmpty && feeMax == null)) {
    add(ListingSection.fees, 'Fees must be numbers.');
  } else if (feeMin != null && feeMax != null && feeMax < feeMin) {
    add(ListingSection.fees,
        "The upper fee can't be lower than the starting fee.");
  } else if ((feeMin != null || feeMax != null) && !has(l.feePeriod)) {
    add(ListingSection.fees, 'Choose what the fee is per.');
  }

  // --- Availability --------------------------------------------------------
  if (l.availability.any((s) => s.place.trim().isEmpty)) {
    add(ListingSection.availability, 'Every time slot needs a place.');
  }
  // String comparison works because both are zero-padded HH:mm.
  if (l.availability.any((s) => s.start.compareTo(s.end) >= 0)) {
    add(ListingSection.availability, 'A slot must end after it starts.');
  }

  // --- Proof ---------------------------------------------------------------
  if (!has(l.photoUrl)) {
    add(ListingSection.proof, 'A profile photo is required.');
  }

  final certs = l.certifications.where((c) => !c.isBlank);
  if (certs.any((c) => c.name.trim().isEmpty)) {
    add(ListingSection.proof, 'Every certification needs a name.');
  }
  if (certs.any((c) =>
      c.year.trim().isNotEmpty &&
      !RegExp(r'^\d{4}$').hasMatch(c.year.trim()))) {
    add(ListingSection.proof, 'Certification year should be a 4-digit year.');
  }

  return problems;
}

/// The sections that still have something wrong in them.
Set<ListingSection> sectionsWithProblems(Listing l, {String? phone}) =>
    listingProblems(l, phone: phone).map((p) => p.section).toSet();
