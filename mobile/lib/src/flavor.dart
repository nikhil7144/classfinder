/// Which app this build is.
///
/// The schema decided this, not the app: profiles.role is a single column and
/// both party tables are unique on user_id, so one account is one role
/// permanently. switch_role() refuses once a profile is complete and deletes
/// the row for the role being left — an onboarding escape hatch, not dual-role
/// support. See MOBILE-PLAN.md §1.
enum Flavor {
  /// Parents and adult learners.
  seeker,

  /// Coaches and academies. Event organisers are deliberately not here — see
  /// `roles` below.
  provider;

  bool get isSeeker => this == Flavor.seeker;
  bool get isProvider => this == Flavor.provider;

  /// What the store listing and the app bar call it.
  String get appName => switch (this) {
        Flavor.seeker => 'Aspire91',
        Flavor.provider => 'Aspire91 for Coaches',
      };

  /// The role this build expects on profiles.role. An account whose role does
  /// not match belongs elsewhere — see MOBILE-PLAN.md §5, and do not route
  /// them to choose-role: that offers switch_role, which deletes a completed
  /// listing.
  ///
  /// Organiser is not here, and that is a decision rather than an omission.
  /// It was originally meant to ride inside this flavor, but an organiser
  /// shares none of what this app does: no listing, no demand feed, no
  /// queries, no Space. Four of the five tabs would be empty and the fifth
  /// would offer them a coach listing they must not create. Running events is
  /// a desk job — dates, venues, fee tiers, a register — and it stays on the
  /// web, where it already works.
  Set<String> get roles => switch (this) {
        Flavor.seeker => {'seeker'},
        Flavor.provider => {'provider'},
      };
}

/// Set once, at the top of main_seeker.dart / main_provider.dart.
late final Flavor appFlavor;
