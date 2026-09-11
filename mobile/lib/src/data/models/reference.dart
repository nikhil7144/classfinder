/// Cities, areas and the taxonomy — everything the pickers need.
///
/// One call, fetched once and kept. These five tables are public, small,
/// identical for everyone, and change only when an admin edits them, which is
/// why the service returns them together instead of each screen fetching the
/// slice it wants on mount.
///
/// The lookups below are built once in the constructor rather than searched
/// per row: a listing form renders a few hundred names and would otherwise
/// scan the area list for every one of them.
library;

class City {
  const City({required this.id, required this.name, required this.state});

  final String id;
  final String name;
  final String? state;

  factory City.fromJson(Map<String, dynamic> json) => City(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        state: json['state'] as String?,
      );
}

class Area {
  const Area({
    required this.id,
    required this.cityId,
    required this.name,
    required this.isLive,
  });

  final String id;
  final String cityId;
  final String name;

  /// Open to seekers. A coach may register in an area before it opens, so this
  /// greys a row and never removes it.
  final bool isLive;

  factory Area.fromJson(Map<String, dynamic> json) => Area(
        id: json['id'] as String,
        cityId: json['cityId'] as String? ?? '',
        name: json['name'] as String? ?? '',
        isLive: json['isLive'] as bool? ?? false,
      );
}

class ServiceCategory {
  const ServiceCategory({
    required this.id,
    required this.name,
    required this.group,
  });

  final String id;
  final String name;

  /// One of the eight taxonomy groups. Decides the colour it renders in.
  final String group;

  factory ServiceCategory.fromJson(Map<String, dynamic> json) =>
      ServiceCategory(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        group: json['group'] as String? ?? '',
      );
}

class ProviderCategory {
  const ProviderCategory({
    required this.id,
    required this.name,
    required this.providerType,
  });

  final String id;
  final String name;

  /// 'individual' or 'institution'. A coach only sees the ones for the type
  /// they picked, because "Dance Teacher" and "Dance Academy" are different
  /// rows and choosing the wrong one changes what the form asks for next.
  final String providerType;

  factory ProviderCategory.fromJson(Map<String, dynamic> json) =>
      ProviderCategory(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        providerType: json['providerType'] as String? ?? 'individual',
      );
}

class TeachingPlace {
  const TeachingPlace({
    required this.id,
    required this.label,
    required this.description,
    required this.sortOrder,
  });

  /// A short text id, not a uuid — 'own_centre', 'student_home', 'online'.
  final String id;
  final String label;
  final String? description;
  final int sortOrder;

  factory TeachingPlace.fromJson(Map<String, dynamic> json) => TeachingPlace(
        id: json['id'] as String,
        label: json['label'] as String? ?? '',
        description: json['description'] as String?,
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      );
}

class Reference {
  Reference({
    required this.cities,
    required this.areas,
    required this.serviceCategories,
    required this.providerCategories,
    required this.teachingPlaces,
  })  : _cityById = {for (final c in cities) c.id: c},
        _areaById = {for (final a in areas) a.id: a},
        _serviceById = {for (final s in serviceCategories) s.id: s};

  final List<City> cities;
  final List<Area> areas;
  final List<ServiceCategory> serviceCategories;
  final List<ProviderCategory> providerCategories;
  final List<TeachingPlace> teachingPlaces;

  final Map<String, City> _cityById;
  final Map<String, Area> _areaById;
  final Map<String, ServiceCategory> _serviceById;

  City? city(String? id) => id == null ? null : _cityById[id];
  Area? area(String? id) => id == null ? null : _areaById[id];
  ServiceCategory? service(String? id) => id == null ? null : _serviceById[id];

  List<Area> areasIn(String cityId) =>
      areas.where((a) => a.cityId == cityId).toList();

  List<ProviderCategory> categoriesFor(String providerType) =>
      providerCategories.where((c) => c.providerType == providerType).toList();

  /// "Vijay Nagar, Indore" — an area name alone is ambiguous across cities,
  /// and a coach picking service areas is looking at a flat list of them.
  String areaLabel(String id) {
    final a = _areaById[id];
    if (a == null) return 'Unknown area';
    final c = _cityById[a.cityId];
    return c == null ? a.name : '${a.name}, ${c.name}';
  }

  String serviceName(String id) => _serviceById[id]?.name ?? 'Unknown';

  String teachingPlaceLabel(String id) => teachingPlaces
      .firstWhere(
        (p) => p.id == id,
        orElse: () => TeachingPlace(
            id: id, label: id, description: null, sortOrder: 999),
      )
      .label;

  factory Reference.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) =>
        ((json[key] as List?) ?? const [])
            .map((e) => parse(e as Map<String, dynamic>))
            .toList();

    return Reference(
      cities: list('cities', City.fromJson),
      areas: list('areas', Area.fromJson),
      serviceCategories: list('serviceCategories', ServiceCategory.fromJson),
      providerCategories: list('providerCategories', ProviderCategory.fromJson),
      teachingPlaces: list('teachingPlaces', TeachingPlace.fromJson)
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
    );
  }
}
