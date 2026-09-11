import 'package:flutter/material.dart';

import '../../theme/theme.dart';

/// One thing that can be picked.
class PickOption {
  const PickOption({
    required this.id,
    required this.label,
    this.sublabel,
    this.dot,
    this.dimmed = false,
  });

  final String id;
  final String label;

  /// A second line — the city an area is in, the group a category belongs to.
  final String? sublabel;

  /// A taxonomy colour. A dot, never a fill.
  final Color? dot;

  /// Shown, but greyed: an area a coach may register in before it opens to
  /// families. Removing it would hide somewhere they genuinely work.
  final bool dimmed;

  bool matches(String query) {
    final q = query.toLowerCase();
    return label.toLowerCase().contains(q) ||
        (sublabel?.toLowerCase().contains(q) ?? false);
  }
}

/// Pick several things from a long list.
///
/// A sheet with a search box rather than a wrap of chips inline: the taxonomy
/// runs to a couple of hundred categories and the area list to more, and
/// neither is scannable laid flat inside a form.
///
/// Returns null if dismissed, which is different from an empty selection —
/// the caller keeps what it had rather than clearing it.
Future<Set<String>?> pickMany(
  BuildContext context, {
  required String title,
  required List<PickOption> options,
  required Set<String> selected,
  String? subtitle,
  int? max,
}) =>
    showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: A91.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (_) => _PickSheet(
        title: title,
        subtitle: subtitle,
        options: options,
        selected: selected,
        max: max,
      ),
    );

/// Pick exactly one. Closes on tap — a confirm button for a single choice is
/// a tap nobody needs.
Future<String?> pickOne(
  BuildContext context, {
  required String title,
  required List<PickOption> options,
  String? selected,
  String? subtitle,
}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: A91.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (_) => _PickSheet(
        title: title,
        subtitle: subtitle,
        options: options,
        selected: selected == null ? {} : {selected},
        single: true,
      ),
    );

class _PickSheet extends StatefulWidget {
  const _PickSheet({
    required this.title,
    required this.options,
    required this.selected,
    this.subtitle,
    this.single = false,
    this.max,
  });

  final String title;
  final String? subtitle;
  final List<PickOption> options;
  final Set<String> selected;
  final bool single;
  final int? max;

  @override
  State<_PickSheet> createState() => _PickSheetState();
}

class _PickSheetState extends State<_PickSheet> {
  late final Set<String> _chosen = {...widget.selected};
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim();
    final visible = query.isEmpty
        ? widget.options
        : widget.options.where((o) => o.matches(query)).toList();

    // Three quarters of the screen, and the keyboard pushes the list rather
    // than covering it.
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.78,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              height: 4,
              width: 40,
              decoration: BoxDecoration(
                color: A91.border,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.title,
                      style: Theme.of(context).textTheme.titleLarge),
                  if (widget.subtitle != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      widget.subtitle!,
                      style: const TextStyle(
                          color: A91.faint, fontSize: 12.5, height: 1.5),
                    ),
                  ],
                  const SizedBox(height: 14),
                  TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      hintText: 'Search',
                      isDense: true,
                      prefixIcon:
                          Icon(Icons.search, color: A91.faint, size: 20),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: visible.isEmpty
                  ? const Center(
                      child: Text('Nothing matches that.',
                          style: TextStyle(color: A91.faint)),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      itemCount: visible.length,
                      itemBuilder: (context, i) =>
                          _row(visible[i], visible[i].id),
                    ),
            ),
            if (!widget.single)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${_chosen.length} selected',
                          style:
                              const TextStyle(color: A91.faint, fontSize: 13),
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, _chosen),
                        child: const Text('Done',
                            style: TextStyle(
                                color: A91.grad2, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(PickOption option, String id) {
    final on = _chosen.contains(id);

    return ListTile(
      dense: true,
      onTap: () {
        if (widget.single) {
          Navigator.pop(context, id);
          return;
        }
        setState(() {
          if (on) {
            _chosen.remove(id);
          } else if (widget.max == null || _chosen.length < widget.max!) {
            _chosen.add(id);
          }
        });
      },
      leading: widget.single
          ? (option.dot == null
              ? null
              : Container(
                  height: 9,
                  width: 9,
                  margin: const EdgeInsets.only(left: 6, top: 14),
                  decoration:
                      BoxDecoration(color: option.dot, shape: BoxShape.circle),
                ))
          : Icon(
              on ? Icons.check_box : Icons.check_box_outline_blank,
              color: on ? A91.grad1 : A91.faint,
              size: 21,
            ),
      title: Row(
        children: [
          if (!widget.single && option.dot != null) ...[
            Container(
              height: 7,
              width: 7,
              decoration:
                  BoxDecoration(color: option.dot, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Text(
              option.label,
              style: TextStyle(
                color: option.dimmed ? A91.faint : A91.ink,
                fontSize: 14.5,
                fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
          if (option.dimmed) ...[
            const SizedBox(width: 8),
            const Text('opening soon',
                style: TextStyle(color: A91.faint, fontSize: 10.5)),
          ],
        ],
      ),
      subtitle: option.sublabel == null
          ? null
          : Text(option.sublabel!,
              style: const TextStyle(color: A91.faint, fontSize: 12)),
      trailing: widget.single && on
          ? const Icon(Icons.check, color: A91.grad1, size: 19)
          : null,
    );
  }
}
