import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/theme.dart';
import '../../widgets/branding.dart';

/// The small parts the listing form is built from.
///
/// A listing has forty-odd inputs across six sections. Without these it is one
/// unreadable file of nested Padding, and every field ends up spaced slightly
/// differently from its neighbour.

/// One panel of the form.
///
/// `unfinished` puts a dot on the header rather than red text through the
/// section: while somebody is filling a form in, everything is unfinished, and
/// shouting about it from the first keystroke is not help.
class Section extends StatelessWidget {
  const Section({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.unfinished = false,
  });

  final String title;
  final String? subtitle;
  final bool unfinished;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: A91.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Eyebrow(title)),
                if (unfinished)
                  Container(
                    height: 7,
                    width: 7,
                    decoration: const BoxDecoration(
                      color: A91.warn,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                style: const TextStyle(
                    color: A91.faint, fontSize: 12.5, height: 1.5),
              ),
            ],
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      );
}

/// A label above a control, with room for a line of help under it.
class Field extends StatelessWidget {
  const Field({
    super.key,
    required this.label,
    required this.child,
    this.hint,
    this.optional = false,
  });

  final String label;
  final Widget child;
  final String? hint;
  final bool optional;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: A91.ink,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (optional) ...[
                  const SizedBox(width: 7),
                  const Text('optional',
                      style: TextStyle(color: A91.faint, fontSize: 11.5)),
                ],
              ],
            ),
            if (hint != null) ...[
              const SizedBox(height: 4),
              Text(
                hint!,
                style: const TextStyle(
                    color: A91.faint, fontSize: 12, height: 1.45),
              ),
            ],
            const SizedBox(height: 9),
            child,
          ],
        ),
      );
}

/// A text input bound to a plain String setter.
///
/// Keeps its own controller so the cursor does not jump to the end on every
/// rebuild — which is what happens when a TextField is given `value` from a
/// parent that rebuilds on change.
class TextInput extends StatefulWidget {
  const TextInput({
    super.key,
    required this.initial,
    required this.onChanged,
    this.hintText,
    this.maxLines = 1,
    this.maxLength,
    this.keyboardType,
    this.digitsOnly = false,
  });

  final String initial;
  final ValueChanged<String> onChanged;
  final String? hintText;
  final int maxLines;
  final int? maxLength;
  final TextInputType? keyboardType;
  final bool digitsOnly;

  @override
  State<TextInput> createState() => _TextInputState();
}

class _TextInputState extends State<TextInput> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _controller,
        onChanged: widget.onChanged,
        maxLines: widget.maxLines,
        minLines: widget.maxLines > 1 ? 3 : 1,
        maxLength: widget.maxLength,
        keyboardType: widget.keyboardType ??
            (widget.digitsOnly ? TextInputType.number : null),
        inputFormatters:
            widget.digitsOnly ? [FilteringTextInputFormatter.digitsOnly] : null,
        textCapitalization: widget.maxLines > 1
            ? TextCapitalization.sentences
            : TextCapitalization.words,
        style: const TextStyle(fontSize: 14.5, height: 1.45),
        decoration: InputDecoration(
          hintText: widget.hintText,
          counterText: '',
          isDense: true,
        ),
      );
}

/// A row that opens a picker. Shows what is chosen, or a prompt if nothing is.
class PickerField extends StatelessWidget {
  const PickerField({
    super.key,
    required this.value,
    required this.placeholder,
    required this.onTap,
  });

  final String? value;
  final String placeholder;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final chosen = value != null && value!.isNotEmpty;

    return Material(
      color: A91.surface2,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: A91.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  chosen ? value! : placeholder,
                  style: TextStyle(
                    color: chosen ? A91.ink : A91.faint,
                    fontSize: 14.5,
                  ),
                ),
              ),
              const Icon(Icons.expand_more, color: A91.faint, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

/// A chip that toggles. Selected is a filled charcoal with a coral edge —
/// never the gradient, which belongs to primary actions.
class ToggleChip extends StatelessWidget {
  const ToggleChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.dot,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// A taxonomy colour, shown as a dot beside the label. Taxonomy colours
  /// never fill a control, so this is as far as one gets to go.
  final Color? dot;

  @override
  Widget build(BuildContext context) => Material(
        color: selected ? A91.surface3 : A91.surface2,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: selected ? A91.grad1 : A91.border,
                width: selected ? 1.3 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (dot != null) ...[
                  Container(
                    height: 7,
                    width: 7,
                    decoration:
                        BoxDecoration(color: dot, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 7),
                ],
                Text(
                  label,
                  style: TextStyle(
                    color: selected ? A91.ink : A91.muted,
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

/// Chips that wrap, which is every set of options on this form.
class ChipWrap extends StatelessWidget {
  const ChipWrap({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) =>
      Wrap(spacing: 8, runSpacing: 8, children: children);
}
