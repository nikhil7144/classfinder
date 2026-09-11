import 'package:flutter/material.dart';

import '../../data/models/event.dart';
import '../../theme/theme.dart';
import '../listing/fields.dart';

/// What families can enter, and what each one costs.
///
/// A category is the row that actually carries a price and a number of places,
/// which is why it is not a field on the event. Most competitions run an
/// under-10 singles and an under-14 team at different fees, and a single fee
/// on the event could not say that.
///
/// A row that already has an id keeps it. That is what lets a category keep
/// its entries across a save — dropping the id would replace the row and take
/// everybody who had entered with it.
class CategoriesEditor extends StatelessWidget {
  const CategoriesEditor({
    super.key,
    required this.items,
    required this.onChanged,
  });

  final List<EventCategory> items;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < items.length; i++)
            _Row(
              key: ValueKey('cat-${items[i].id ?? i}-${items.length}'),
              category: items[i],
              onChanged: onChanged,
              onRemove: () {
                items.removeAt(i);
                onChanged();
              },
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () {
                items.add(EventCategory(sortOrder: items.length));
                onChanged();
              },
              icon: const Icon(Icons.add, size: 18, color: A91.grad2),
              label: Text(
                items.isEmpty ? 'Add a category' : 'Add another',
                style: const TextStyle(
                    color: A91.grad2, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      );
}

class _Row extends StatelessWidget {
  const _Row({
    super.key,
    required this.category,
    required this.onChanged,
    required this.onRemove,
  });

  final EventCategory category;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    // A category with entries cannot simply be deleted — the families in it
    // have places. Saying so beats letting somebody try and reading a
    // constraint violation.
    final locked = category.entriesCount > 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(14, 14, 8, 6),
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
              children: [
                TextInput(
                  initial: category.name,
                  hintText: 'Under-10 Singles',
                  maxLength: 120,
                  onChanged: (v) {
                    category.name = v;
                    onChanged();
                  },
                ),
                const SizedBox(height: 11),
                ChipWrap(
                  children: [
                    for (final entry in entryTypes.entries)
                      ToggleChip(
                        label: entry.value,
                        selected: category.entryType == entry.key,
                        onTap: () {
                          category.entryType = entry.key;
                          // Only a team carries a size. Leaving one behind is
                          // what the check constraint refuses.
                          if (!category.isTeam) category.teamSize = null;
                          onChanged();
                        },
                      ),
                  ],
                ),
                if (category.isTeam) ...[
                  const SizedBox(height: 11),
                  _Small(
                    label: 'Children per team',
                    value: category.teamSize ?? '',
                    hint: '4',
                    onChanged: (v) {
                      category.teamSize = v;
                      onChanged();
                    },
                  ),
                ],
                const SizedBox(height: 11),
                Row(
                  children: [
                    Expanded(
                      child: _Small(
                        label: 'Fee ₹',
                        value: category.feeAmount,
                        hint: '300',
                        onChanged: (v) {
                          category.feeAmount = v;
                          onChanged();
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _Small(
                        label: 'Places',
                        value: category.capacity ?? '',
                        hint: 'any',
                        onChanged: (v) {
                          category.capacity = v;
                          onChanged();
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 11),
                Row(
                  children: [
                    Expanded(
                      child: _Small(
                        label: 'Youngest',
                        value: category.minAge,
                        hint: 'any',
                        onChanged: (v) {
                          category.minAge = v;
                          onChanged();
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _Small(
                        label: 'Oldest',
                        value: category.maxAge,
                        hint: 'any',
                        onChanged: (v) {
                          category.maxAge = v;
                          onChanged();
                        },
                      ),
                    ),
                  ],
                ),
                if (locked) ...[
                  const SizedBox(height: 10),
                  Text(
                    '${category.entriesCount} '
                    '${category.entriesCount == 1 ? 'family has' : 'families have'} '
                    'entered this one.',
                    style: const TextStyle(color: A91.faint, fontSize: 11.5),
                  ),
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
          IconButton(
            onPressed: locked ? null : onRemove,
            icon: Icon(Icons.close,
                size: 18, color: locked ? A91.border : A91.faint),
            tooltip: locked ? 'Somebody has entered this' : 'Remove',
          ),
        ],
      ),
    );
  }
}

/// A labelled number, narrow enough to sit two to a row.
class _Small extends StatelessWidget {
  const _Small({
    required this.label,
    required this.value,
    required this.hint,
    required this.onChanged,
  });

  final String label;
  final String value;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: A91.faint, fontSize: 11.5)),
          const SizedBox(height: 5),
          TextInput(
            initial: value,
            hintText: hint,
            digitsOnly: true,
            maxLength: 6,
            onChanged: onChanged,
          ),
        ],
      );
}
