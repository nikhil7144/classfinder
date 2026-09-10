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

  /// Coaches, academies and event organisers. Organiser is a role inside this
  /// flavor rather than a third app.
  provider;

  bool get isSeeker => this == Flavor.seeker;
  bool get isProvider => this == Flavor.provider;

  /// What the store listing and the app bar call it.
  String get appName => switch (this) {
        Flavor.seeker => 'Aspire91',
        Flavor.provider => 'Aspire91 for Coaches',
      };

  /// The role this build expects on profiles.role. An account whose role does
  /// not match belongs in the other app — see MOBILE-PLAN.md §5, and do not
  /// route them to choose-role: that offers switch_role, which deletes a
  /// completed listing.
  Set<String> get roles => switch (this) {
        Flavor.seeker => {'seeker'},
        Flavor.provider => {'provider', 'organiser'},
      };
}

/// Set once, at the top of main_seeker.dart / main_provider.dart.
late final Flavor appFlavor;
