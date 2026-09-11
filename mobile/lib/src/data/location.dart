import 'package:geolocator/geolocator.dart';

/// "Use my location", and every way it can politely fail.
///
/// Optional everywhere it is offered. The web's fallback message says the
/// whole design in one line — *"No problem — results are sorted from the
/// centre of your area."* — so nothing here throws, and a refusal is an answer
/// rather than an error.
///
/// Coarse accuracy on purpose. Search sorts coaches by distance from a
/// neighbourhood, not from a doorstep, and asking for a precise fix would be
/// a scarier permission prompt in exchange for precision nobody uses.
class Located {
  const Located({required this.lat, required this.lng});

  final double lat;
  final double lng;
}

/// What happened, in words a screen can show without translating.
class LocationResult {
  const LocationResult._(this.position, this.message);

  const LocationResult.found(Located position) : this._(position, null);
  const LocationResult.refused(String message) : this._(null, message);

  final Located? position;

  /// Null when it worked. Otherwise something to put under the button.
  final String? message;

  bool get ok => position != null;
}

const _fallback =
    'No problem — results are sorted from the centre of your area.';

Future<LocationResult> findMe() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const LocationResult.refused(
        'Location is switched off on this phone. $_fallback',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    // Denied forever cannot be re-asked from here — the system dialog will not
    // appear again — so it is said differently from an ordinary refusal.
    if (permission == LocationPermission.deniedForever) {
      return const LocationResult.refused(
        'Location is blocked for Aspire91 in your phone settings. $_fallback',
      );
    }
    if (permission == LocationPermission.denied) {
      return const LocationResult.refused(_fallback);
    }

    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.low,
        // A fix is a nicety. Waiting half a minute for one on a screen
        // somebody is filling in is not.
        timeLimit: Duration(seconds: 12),
      ),
    );

    return LocationResult.found(
      Located(lat: position.latitude, lng: position.longitude),
    );
  } catch (_) {
    // A timeout, no signal, an emulator with nothing set. None of it is worth
    // a red error on an optional field.
    return const LocationResult.refused(
      "Couldn't get a location just now. $_fallback",
    );
  }
}
