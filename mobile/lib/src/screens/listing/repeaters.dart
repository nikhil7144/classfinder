import 'package:flutter/material.dart';

import '../../data/listing_rules.dart';
import '../../data/models/listing.dart';
import '../../data/models/reference.dart';
import '../../theme/theme.dart';
import 'fields.dart';
import 'pickers.dart';

/// The three repeating parts of a listing: certifications, availability and
/// branches. Each is a list somebody adds rows to, and each row is a small
/// card with a remove button rather than a table — a phone has no room for
/// columns.

/// Shared chrome: a bordered card with a delete in the corner.
class _RepeaterRow extends StatelessWidget {
  const _RepeaterRow(
      {super.key, required this.onRemove, required this.children});

  final VoidCallback onRemove;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.fromLTRB(14, 14, 8, 4),
        decoration: BoxDecoration(
          color: A91.surface2,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: A91.borderSoft),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: children,
              ),
            ),
            IconButton(
              onPressed: onRemove,
              icon: const Icon(Icons.close, size: 18, color: A91.faint),
              tooltip: 'Remove',
            ),
          ],
        ),
      );
}

class _AddButton extends StatelessWidget {
  const _AddButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: onTap,
          icon: const Icon(Icons.add, size: 18, color: A91.grad2),
          label: Text(label,
              style: const TextStyle(
                  color: A91.grad2, fontWeight: FontWeight.w600)),
        ),
      );
}

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

class CertificationsEditor extends StatelessWidget {
  const CertificationsEditor({
    super.key,
    required this.items,
    required this.onChanged,
  });

  final List<Certification> items;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < items.length; i++)
            _RepeaterRow(
              // Keyed by index and rebuilt on remove, so the TextInputs below
              // take their initial value from the row that is actually there.
              key: ValueKey('cert-$i-${items.length}'),
              onRemove: () {
                items.removeAt(i);
                onChanged();
              },
              children: [
                TextInput(
                  initial: items[i].name,
                  hintText: 'What it is',
                  onChanged: (v) {
                    items[i].name = v;
                    onChanged();
                  },
                ),
                const SizedBox(height: 9),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextInput(
                        initial: items[i].issuer,
                        hintText: 'Who awarded it',
                        onChanged: (v) {
                          items[i].issuer = v;
                          onChanged();
                        },
                      ),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      flex: 2,
                      child: TextInput(
                        initial: items[i].year,
                        hintText: 'Year',
                        maxLength: 4,
                        digitsOnly: true,
                        onChanged: (v) {
                          items[i].year = v;
                          onChanged();
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ],
            ),
          _AddButton(
            label: items.isEmpty ? 'Add a certification' : 'Add another',
            onTap: () {
              items.add(Certification());
              onChanged();
            },
          ),
        ],
      );
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

class AvailabilityEditor extends StatelessWidget {
  const AvailabilityEditor({
    super.key,
    required this.items,
    required this.places,
    required this.reference,
    required this.onChanged,
  });

  final List<AvailabilitySlot> items;

  /// Only the teaching places the coach actually selected. Offering all of
  /// them would let somebody promise Tuesdays at a centre they do not have.
  final List<String> places;
  final Reference reference;
  final VoidCallback onChanged;

  Future<void> _pickTime(
    BuildContext context,
    String current,
    ValueChanged<String> set,
  ) async {
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: int.tryParse(parts.first) ?? 16,
        minute: int.tryParse(parts.last) ?? 0,
      ),
    );
    if (picked == null) return;
    // Zero-padded, so the string comparison the rules do is a time comparison.
    set('${picked.hour.toString().padLeft(2, '0')}:'
        '${picked.minute.toString().padLeft(2, '0')}');
  }

  @override
  Widget build(BuildContext context) {
    if (places.isEmpty) {
      return const Text(
        'Choose how you run your classes first — a time slot has to be '
        'somewhere.',
        style: TextStyle(color: A91.faint, fontSize: 13, height: 1.5),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < items.length; i++)
          _RepeaterRow(
            key: ValueKey('slot-$i-${items.length}'),
            onRemove: () {
              items.removeAt(i);
              onChanged();
            },
            children: [
              ChipWrap(
                children: [
                  for (final entry in weekDays.entries)
                    ToggleChip(
                      label: entry.value,
                      selected: items[i].day == entry.key,
                      onTap: () {
                        items[i].day = entry.key;
                        onChanged();
                      },
                    ),
                ],
              ),
              const SizedBox(height: 12),
              PickerField(
                value: items[i].place.isEmpty
                    ? null
                    : reference.teachingPlaceLabel(items[i].place),
                placeholder: 'Where',
                onTap: () async {
                  final picked = await pickOne(
                    context,
                    title: 'Where is this slot',
                    selected: items[i].place.isEmpty ? null : items[i].place,
                    options: [
                      for (final p in places)
                        PickOption(
                            id: p, label: reference.teachingPlaceLabel(p)),
                    ],
                  );
                  if (picked == null) return;
                  items[i].place = picked;
                  onChanged();
                },
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: PickerField(
                      value: items[i].start,
                      placeholder: 'From',
                      onTap: () => _pickTime(context, items[i].start, (v) {
                        items[i].start = v;
                        onChanged();
                      }),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: PickerField(
                      value: items[i].end,
                      placeholder: 'To',
                      onTap: () => _pickTime(context, items[i].end, (v) {
                        items[i].end = v;
                        onChanged();
                      }),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],
          ),
        _AddButton(
          label: items.isEmpty ? 'Add a time' : 'Add another time',
          onTap: () {
            items.add(AvailabilitySlot(place: places.first));
            onChanged();
          },
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

class BranchesEditor extends StatelessWidget {
  const BranchesEditor({
    super.key,
    required this.items,
    required this.reference,
    required this.onChanged,
  });

  final List<Branch> items;
  final Reference reference;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < items.length; i++)
            _RepeaterRow(
              key: ValueKey('branch-$i-${items.length}'),
              onRemove: () {
                items.removeAt(i);
                onChanged();
              },
              children: [
                TextInput(
                  initial: items[i].label,
                  hintText: 'Branch name',
                  onChanged: (v) {
                    items[i].label = v;
                    onChanged();
                  },
                ),
                const SizedBox(height: 9),
                TextInput(
                  initial: items[i].address,
                  hintText: 'Address',
                  maxLines: 2,
                  onChanged: (v) {
                    items[i].address = v;
                    onChanged();
                  },
                ),
                const SizedBox(height: 9),
                PickerField(
                  value: items[i].areaId == null
                      ? null
                      : reference.areaLabel(items[i].areaId!),
                  placeholder: 'Area',
                  onTap: () async {
                    final picked = await pickOne(
                      context,
                      title: 'Where is this branch',
                      subtitle:
                          'This is what makes it findable. An area that has not '
                          'opened to families yet can still be chosen.',
                      selected: items[i].areaId,
                      options: areaOptions(reference),
                    );
                    if (picked == null) return;
                    items[i].areaId = picked;
                    onChanged();
                  },
                ),
                const SizedBox(height: 9),
                TextInput(
                  initial: items[i].phone,
                  hintText: 'Phone at this branch',
                  keyboardType: TextInputType.phone,
                  onChanged: (v) {
                    items[i].phone = v;
                    onChanged();
                  },
                ),
                const SizedBox(height: 10),
              ],
            ),
          _AddButton(
            label: items.isEmpty ? 'Add a branch' : 'Add another branch',
            onTap: () {
              items.add(Branch());
              onChanged();
            },
          ),
        ],
      );
}

/// Every area, city first so the list reads as a place rather than a jumble of
/// neighbourhood names.
List<PickOption> areaOptions(Reference reference) {
  final options = <PickOption>[];
  for (final city in reference.cities) {
    for (final area in reference.areasIn(city.id)) {
      options.add(PickOption(
        id: area.id,
        label: area.name,
        sublabel:
            city.state == null ? city.name : '${city.name}, ${city.state}',
        dimmed: !area.isLive,
      ));
    }
  }
  return options;
}
