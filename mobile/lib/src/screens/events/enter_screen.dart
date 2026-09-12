import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/entry_rules.dart';
import '../../data/models/event.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';
import '../listing/fields.dart';

/// Entering one category — /events/[id]/enter/[categoryId].
///
/// **The one place in this product that takes a child's name and date of
/// birth.** Everything about this screen follows from that:
///
///   * the consent box is never pre-ticked, and the wording is the same
///     sentence the web shows, because the service records which wording was
///     agreed and refuses the entry without it;
///   * the date of birth is asked for because an under-10 tournament means
///     under ten on the day, and the service checks it — not because it is
///     nice to have;
///   * nothing is charged here, and the screen says so, because a form asking
///     for a child's details and a fee in the same breath reads like one that
///     is about to take payment.
class EnterScreen extends ConsumerStatefulWidget {
  const EnterScreen({super.key, required this.event, required this.category});

  final Event event;
  final EventCategory category;

  @override
  ConsumerState<EnterScreen> createState() => _EnterScreenState();
}

class _EnterScreenState extends ConsumerState<EnterScreen> {
  String _name = '';
  DateTime? _dob;
  bool _consent = false;
  bool _busy = false;
  bool _done = false;
  String? _error;

  /// The rest of a team. The entrant counts as one, so a team of four needs
  /// three more.
  late final List<({TextEditingController name, ValueNotifier<DateTime?> dob})>
      _members = List.generate(
    teamMatesNeeded(
      isTeam: widget.category.isTeam,
      teamSize: widget.category.teamSize ?? '',
    ),
    (_) => (name: TextEditingController(), dob: ValueNotifier<DateTime?>(null)),
  );

  @override
  void dispose() {
    for (final m in _members) {
      m.name.dispose();
      m.dob.dispose();
    }
    super.dispose();
  }

  /// Null when there is nothing left to fix. The same three checks the web
  /// makes, in the same order.
  String? get _problem => entryProblem(
        participantName: _name,
        memberNames: [for (final m in _members) m.name.text],
        consent: _consent,
      );

  bool get _ready => _problem == null;

  Future<DateTime?> _pickDob(DateTime? current) => showDatePicker(
        context: context,
        initialDate: current ?? DateTime(DateTime.now().year - 10),
        firstDate: DateTime(DateTime.now().year - 100),
        lastDate: DateTime.now(),
        helpText: 'Date of birth',
      );

  Future<void> _submit() async {
    if (!_ready || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(eventsRepositoryProvider).enter(
        categoryId: widget.category.id!,
        participantName: _name,
        participantDob: _dob == null ? null : isoDate(_dob!),
        consentGiven: _consent,
        members: [
          for (final m in _members)
            (
              name: m.name.text,
              dob: m.dob.value == null ? null : isoDate(m.dob.value!),
            ),
        ],
      );

      ref.invalidate(myEntriesProvider);
      // The category's places-left count has changed.
      ref.invalidate(eventProvider(widget.event.id!));

      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? get _ages =>
      formatAges(widget.category.minAge, widget.category.maxAge);

  @override
  Widget build(BuildContext context) {
    final fee = int.tryParse(widget.category.feeAmount);

    return Scaffold(
      appBar: AppBar(title: Text(_done ? 'Entered' : 'Enter')),
      body: SafeArea(
        child: _done ? _confirmation() : _form(fee),
      ),
    );
  }

  Widget _confirmation() => ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
        children: [
          const Icon(Icons.check_circle_outline, color: A91.teal, size: 40),
          const SizedBox(height: 16),
          Text(
            'That is done',
            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  fontSize: 24,
                ),
          ),
          const SizedBox(height: 10),
          Text(
            '$_name is entered in ${widget.category.name} at '
            '${widget.event.title}. You will find it under Your entries, with '
            'a receipt number.',
            style: const TextStyle(color: A91.muted, height: 1.6),
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: 'Done',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      );

  Widget _form(int? fee) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          Section(
            title: widget.category.name,
            subtitle: widget.event.title,
            children: [
              Field(
                label: widget.category.isTeam
                    ? 'Who is entering — you, or your child'
                    : 'Who is taking part',
                child: TextInput(
                  initial: _name,
                  hintText: 'Aarav Sharma',
                  maxLength: 120,
                  onChanged: (v) => setState(() => _name = v),
                ),
              ),
              Field(
                label: 'Date of birth',
                optional: true,
                hint: _ages == null
                    ? 'Checked against the age range as it will be on the day '
                        'of the event.'
                    : 'Checked against ${_ages!.toLowerCase()} as it will be '
                        'on the day of the event.',
                child: _DateField(
                  value: _dob,
                  onTap: () async {
                    final picked = await _pickDob(_dob);
                    if (picked != null) setState(() => _dob = picked);
                  },
                  onClear: () => setState(() => _dob = null),
                ),
              ),
            ],
          ),
          if (_members.isNotEmpty)
            Section(
              title: 'The rest of the team',
              subtitle: 'You plus ${_members.length} more makes '
                  '${widget.category.teamSize}.',
              children: [
                for (var i = 0; i < _members.length; i++) ...[
                  Field(
                    label: 'Team member ${i + 2}',
                    child: TextField(
                      controller: _members[i].name,
                      textCapitalization: TextCapitalization.words,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        hintText: 'Their name',
                        isDense: true,
                      ),
                    ),
                  ),
                  ValueListenableBuilder<DateTime?>(
                    valueListenable: _members[i].dob,
                    builder: (context, value, _) => Field(
                      label: 'Their date of birth',
                      optional: true,
                      child: _DateField(
                        value: value,
                        onTap: () async {
                          final picked = await _pickDob(value);
                          if (picked != null) _members[i].dob.value = picked;
                        },
                        onClear: () => _members[i].dob.value = null,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          _consentBlock(),
          if (_error != null) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 12, left: 4),
              child: Text(
                _error!,
                style: const TextStyle(
                    color: A91.danger, fontSize: 13.5, height: 1.5),
              ),
            ),
          ],
          Text(
            fee == null || fee == 0
                ? 'Free to enter.'
                : '₹$fee payable to the organiser. Nothing is charged here.',
            style: const TextStyle(color: A91.muted, fontSize: 13),
          ),
          const SizedBox(height: 14),
          PrimaryButton(
            label: 'Confirm this entry',
            busy: _busy,
            onPressed: _ready && !_busy ? _submit : null,
          ),
        ],
      );

  /// The wording is the web's, word for word.
  ///
  /// The service stores which version was agreed against the entry, so the two
  /// clients must not drift — if this sentence changes, ENTRY_CONSENT_VERSION
  /// in api/src/entries/dto/entry.dto.ts changes with it.
  Widget _consentBlock() => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Material(
          color: A91.surface2,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() => _consent = !_consent),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _consent ? A91.grad1 : A91.borderSoft,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Never pre-ticked. A box already ticked is not consent.
                  Checkbox(
                    value: _consent,
                    onChanged: (v) => setState(() => _consent = v ?? false),
                    activeColor: A91.grad1,
                    visualDensity: VisualDensity.compact,
                  ),
                  const SizedBox(width: 6),
                  const Expanded(
                    child: Text(
                      'I am taking part myself, or I am the parent or guardian '
                      'of everyone named above and I agree to their name and '
                      'date of birth being held for this event and shared with '
                      'its organiser.',
                      style: TextStyle(
                          color: A91.muted, fontSize: 13, height: 1.55),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.value,
    required this.onTap,
    required this.onClear,
  });

  final DateTime? value;
  final VoidCallback onTap;
  final VoidCallback onClear;

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: PickerField(
              value: value == null
                  ? null
                  : '${value!.day} ${_months[value!.month - 1]} ${value!.year}',
              placeholder: 'Pick a date',
              onTap: onTap,
            ),
          ),
          if (value != null)
            IconButton(
              onPressed: onClear,
              icon: const Icon(Icons.close, size: 18, color: A91.faint),
              tooltip: 'Clear',
            ),
        ],
      );
}
