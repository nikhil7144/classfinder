/// Who is asking, and what they have finished.
///
/// Hand-written rather than generated. openapi-generator needs a JDK 11+ and
/// this machine has 8, so the models the first screens need are written by
/// hand and the generator is left for when that is sorted — tool/gen_api_client.sh
/// still holds the command. The field names match MeDto exactly so swapping to
/// the generated version is a deletion, not a rewrite.
library;

/// The four roles profiles.role permits. `unknown` is not one of them — it is
/// what a client does with a value added after it shipped, rather than
/// throwing on a string it has never seen.
enum Role {
  seeker,
  provider,
  organiser,
  admin,
  unknown;

  static Role parse(String? value) => switch (value) {
        'seeker' => Role.seeker,
        'provider' => Role.provider,
        'organiser' => Role.organiser,
        'admin' => Role.admin,
        _ => Role.unknown,
      };
}

/// The coach's listing, as far as /me reports it. Present only for a provider.
class MeProvider {
  const MeProvider({
    required this.id,
    required this.displayName,
    required this.photoUrl,
    required this.providerType,
    required this.approved,
    required this.isSuspended,
  });

  final String id;
  final String? displayName;
  final String? photoUrl;
  final String providerType;

  /// Visible in search. False means waiting on an admin.
  final bool approved;

  /// Taken down. Different from never approved, and the app says so.
  final bool isSuspended;

  factory MeProvider.fromJson(Map<String, dynamic> json) => MeProvider(
        id: json['id'] as String,
        displayName: json['displayName'] as String?,
        photoUrl: json['photoUrl'] as String?,
        providerType: json['providerType'] as String? ?? 'individual',
        approved: json['approved'] as bool? ?? false,
        isSuspended: json['isSuspended'] as bool? ?? false,
      );
}

/// The first call after signing in, and the one that decides what to render.
class Me {
  const Me({
    required this.id,
    required this.role,
    required this.profileComplete,
    required this.phone,
    required this.provider,
  });

  final String id;

  /// Null means a verified account that has not chosen a role yet. That is not
  /// an error — the app sends them to pick one.
  final Role? role;

  final bool profileComplete;
  final String? phone;
  final MeProvider? provider;

  factory Me.fromJson(Map<String, dynamic> json) => Me(
        id: json['id'] as String,
        role: json['role'] == null ? null : Role.parse(json['role'] as String),
        profileComplete: json['profileComplete'] as bool? ?? false,
        phone: json['phone'] as String?,
        provider: json['provider'] == null
            ? null
            : MeProvider.fromJson(json['provider'] as Map<String, dynamic>),
      );

  /// Whether this account belongs in the flavor that is running.
  bool belongsIn(Set<String> roles) =>
      role != null && roles.contains(role!.name);
}
