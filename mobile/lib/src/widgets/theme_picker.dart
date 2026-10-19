import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../theme/theme.dart';

/// Light / Dark / Auto — the mobile equivalent of the web's ThemeToggle.
///
/// Three segments, not a single on/off switch: "Auto" is a real, persisted
/// choice meaning "follow the phone", distinct from having picked light or
/// dark outright. Collapsing it into a boolean would mean someone who wants
/// their evenings dark has to repick it every night, which is the one thing
/// System already does for free.
///
/// Lives on the account/more screen rather than inside Settings — settings
/// is about the login, and appearance is not a login matter.
class ThemeModePicker extends ConsumerWidget {
  const ThemeModePicker({super.key});

  static const _options = [
    (ThemeMode.light, 'Light'),
    (ThemeMode.dark, 'Dark'),
    (ThemeMode.system, 'Auto'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(themeModeProvider);

    return Row(
      children: [
        for (final (mode, label) in _options) ...[
          if (mode != _options.first.$1) const SizedBox(width: 8),
          Expanded(
            child: _Segment(
              label: label,
              selected: current == mode,
              onTap: () => ref.read(themeModeProvider.notifier).set(mode),
            ),
          ),
        ],
      ],
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 11),
            decoration: BoxDecoration(
              color: selected ? A91.surface3 : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: selected ? A91.coral : A91.border),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: selected ? A91.ink : A91.muted,
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      );
}
