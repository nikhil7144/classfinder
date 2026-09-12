import 'coach.dart';

/// A coach worth looking at first, and why.
///
/// The provider is the same shape search returns — eighteen fields, camelCase,
/// the same schema in the contract. It used to be the raw database row, which
/// made this the one endpoint a client had to know an exception for.
class CoachSuggestion {
  const CoachSuggestion({required this.coach, required this.reason});

  final CoachResult coach;

  /// Why the model placed this coach here. Null when the list was not ranked —
  /// too few candidates to be worth asking, so it is in plain distance order.
  final String? reason;

  factory CoachSuggestion.fromJson(Map<String, dynamic> json) =>
      CoachSuggestion(
        coach: CoachResult.fromJson(json['provider'] as Map<String, dynamic>),
        reason: json['reason'] as String?,
      );
}

/// Why there is nothing to suggest. Rendered very differently from each other:
/// `noRequirement` is an invitation, `notASeeker` is not.
enum NoSuggestionsReason {
  notASeeker('not_a_seeker'),
  noRequirement('no_requirement'),
  noOrigin('no_origin'),
  nothingNearby('nothing_nearby');

  const NoSuggestionsReason(this.id);

  final String id;

  static NoSuggestionsReason? parse(String? value) {
    for (final r in NoSuggestionsReason.values) {
      if (r.id == value) return r;
    }
    return null;
  }
}

class CoachSuggestions {
  const CoachSuggestions({
    required this.suggestions,
    required this.ranked,
    required this.reason,
  });

  final List<CoachSuggestion> suggestions;

  /// False when the list is in plain distance order rather than ranked.
  final bool ranked;

  /// Absent when there is something to show.
  final NoSuggestionsReason? reason;

  factory CoachSuggestions.fromJson(Map<String, dynamic> json) =>
      CoachSuggestions(
        suggestions: ((json['suggestions'] as List?) ?? const [])
            .map((e) => CoachSuggestion.fromJson(e as Map<String, dynamic>))
            .toList(),
        ranked: json['ranked'] as bool? ?? false,
        reason: NoSuggestionsReason.parse(json['reason'] as String?),
      );
}
