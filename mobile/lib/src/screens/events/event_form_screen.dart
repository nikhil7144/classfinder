import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/event.dart';
import '../../data/models/reference.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/states.dart';
import '../listing/fields.dart';
import '../listing/pickers.dart';
import 'categories_editor.dart';

/// Creating and editing an event — /events/new and /events/[id]/edit.
///
/// One form for both, because they are the same fields and a separate create
/// screen would drift from the edit one. What differs is what can be done at
/// the end: a new event is saved as a draft, and publishing is a second,
/// deliberate act.
///
/// Categories are saved by their own call. They are replaced as a set, keyed
/// on id so a category keeps its entries across a save — folding them into the
/// patch would mean fixing a typo in the title rewrote every category row, and
/// an event mid-registration cannot afford that.
class EventFormScreen extends ConsumerWidget {
  const EventFormScreen({super.key, this.event});

  /// Null to create.
  final Event? event;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceProvider);

    return reference.when(
      loading: () => const Scaffold(body: Loading()),
      error: (error, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorState(
          message: error is ApiException
              ? error.message
              : 'Something went wrong loading the form.',
          onRetry: () => ref.invalidate(referenceProvider),
        ),
      ),
      data: (reference) => _Form(
        reference: reference,
        // A fresh draft when creating; the row itself when editing, which the
        // list already holds.
        initial: event ?? Event(),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.reference, required this.initial});

  final Reference reference;
  final Event initial;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  late final Event _e = widget.initial;

  bool _saving = false;
  String? _error;

  bool get _isNew => widget.initial.id == null;
  Reference get _ref => widget.reference;

  void _changed() => setState(() {});

  /// What is stopping this being saved. The floor is what the service
  /// requires to create one at all — title, city, and a date.
  String? get _problem {
    if (_e.title.trim().length < 3) return 'Give it a name.';
    if (_e.cityId == null) return 'Choose the city it is in.';
    if (_e.bookingMode == 'external' && _e.externalBookingUrl.trim().isEmpty) {
      return 'Add the link families should book on.';
    }
    if (_e.endsAt != null && !_e.endsAt!.isAfter(_e.startsAt)) {
      return 'It has to finish after it starts.';
    }
    if (_e.takesEntriesHere &&
        _e.categories.every((c) => c.name.trim().isEmpty)) {
      return 'Add at least one thing families can enter.';
    }
    if (_e.categories.any((c) => c.name.trim().isEmpty)) {
      return 'Every category needs a name.';
    }
    return null;
  }

  Future<void> _save({bool publish = false}) async {
    final problem = _problem;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final repository = ref.read(eventsRepositoryProvider);

      // Create or patch first: categories need an event id to hang from, so a
      // new event cannot save both in one go.
      final saved = _isNew
          ? await repository.create(_e)
          : await repository.update(_e.id!, _e);

      final categories =
          _e.categories.where((c) => c.name.trim().isNotEmpty).toList();
      if (categories.isNotEmpty || !_isNew) {
        await repository.replaceCategories(saved.id!, categories);
      }

      if (publish) {
        await repository.setStatus(saved.id!, EventStatus.published);
      }

      ref.invalidate(myEventsProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(
            publish
                ? 'Published. Families in the city can see it.'
                : 'Saved as a draft.',
            style: const TextStyle(color: A91.ink),
          ),
        ),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setStatus(EventStatus status) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(eventsRepositoryProvider).setStatus(_e.id!, status);
      ref.invalidate(myEventsProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// A date and then a time, because every moment on this form needs both and
  /// a date alone would silently keep whatever time was there before.
  ///
  /// Backdating is allowed a year: an event being written up after it ran is a
  /// real thing, and refusing it would be the form arguing with a record.
  Future<void> _pickMoment(
    DateTime? current,
    ValueChanged<DateTime?> set,
  ) async {
    final base = current ?? _e.startsAt;

    final date = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (time == null) return;

    set(DateTime(date.year, date.month, date.day, time.hour, time.minute));
    _changed();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isNew ? 'New event' : 'Edit event'),
        actions: [
          if (!_isNew && widget.initial.status == EventStatus.published)
            TextButton(
              onPressed: _saving ? null : () => _setStatus(EventStatus.draft),
              child: const Text('Withdraw',
                  style: TextStyle(color: A91.muted, fontSize: 13)),
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            Section(
              title: 'What it is',
              children: [
                Field(
                  label: 'Name',
                  child: TextInput(
                    initial: _e.title,
                    hintText: 'Indirapuram Under-12 Cricket Trials',
                    maxLength: 160,
                    onChanged: (v) {
                      _e.title = v;
                      _changed();
                    },
                  ),
                ),
                Field(
                  label: 'About it',
                  optional: true,
                  hint: 'What happens, who it suits, what to bring.',
                  child: TextInput(
                    initial: _e.about,
                    maxLines: 5,
                    maxLength: 4000,
                    hintText: 'Two rounds, then a final. Bring your own kit.',
                    onChanged: (v) {
                      _e.about = v;
                      _changed();
                    },
                  ),
                ),
                Field(
                  label: 'What it is about',
                  optional: true,
                  child: PickerField(
                    value: _e.serviceCategoryId == null
                        ? null
                        : _ref.serviceName(_e.serviceCategoryId!),
                    placeholder: 'Choose a sport or subject',
                    onTap: () async {
                      final picked = await pickOne(
                        context,
                        title: 'What it is about',
                        selected: _e.serviceCategoryId,
                        options: [
                          for (final s in _ref.serviceCategories)
                            PickOption(
                              id: s.id,
                              label: s.name,
                              sublabel: s.group,
                              dot: A91.group(s.group),
                            ),
                        ],
                      );
                      if (picked == null) return;
                      _e.serviceCategoryId = picked;
                      _changed();
                    },
                  ),
                ),
              ],
            ),
            Section(
              title: 'When and where',
              children: [
                Field(
                  label: 'Starts',
                  child: PickerField(
                    value: _moment(_e.startsAt),
                    placeholder: 'Pick a date and time',
                    onTap: () => _pickMoment(_e.startsAt, (v) {
                      if (v != null) _e.startsAt = v;
                    }),
                  ),
                ),
                Field(
                  label: 'Finishes',
                  optional: true,
                  child: _Clearable(
                    value: _e.endsAt == null ? null : _moment(_e.endsAt!),
                    placeholder: 'Pick a date and time',
                    onTap: () => _pickMoment(_e.endsAt, (v) => _e.endsAt = v),
                    onClear: () {
                      _e.endsAt = null;
                      _changed();
                    },
                  ),
                ),
                Field(
                  label: 'City',
                  child: PickerField(
                    value: _ref.city(_e.cityId)?.name,
                    placeholder: 'Choose the city',
                    onTap: () async {
                      final picked = await pickOne(
                        context,
                        title: 'Which city',
                        selected: _e.cityId,
                        options: [
                          for (final c in _ref.cities)
                            PickOption(
                                id: c.id, label: c.name, sublabel: c.state),
                        ],
                      );
                      if (picked == null) return;
                      _e.cityId = picked;
                      _changed();
                    },
                  ),
                ),
                Field(
                  label: 'Venue',
                  optional: true,
                  child: TextInput(
                    initial: _e.venueName,
                    hintText: 'Shipra Sports Complex',
                    maxLength: 160,
                    onChanged: (v) {
                      _e.venueName = v;
                      _changed();
                    },
                  ),
                ),
                Field(
                  label: 'Address',
                  optional: true,
                  child: TextInput(
                    initial: _e.venueAddress,
                    maxLines: 2,
                    maxLength: 500,
                    hintText: 'So a parent can find it without ringing you.',
                    onChanged: (v) {
                      _e.venueAddress = v;
                      _changed();
                    },
                  ),
                ),
              ],
            ),
            Section(
              title: 'How families enter',
              subtitle: 'Stated, not guessed. It decides whether there is a '
                  'register to work from on the day.',
              children: [
                Field(
                  label: 'Entries',
                  child: ChipWrap(
                    children: [
                      for (final entry in bookingModes.entries)
                        ToggleChip(
                          label: entry.value,
                          selected: _e.bookingMode == entry.key,
                          onTap: () {
                            _e.bookingMode = entry.key;
                            _changed();
                          },
                        ),
                    ],
                  ),
                ),
                if (_e.bookingMode == 'external')
                  Field(
                    label: 'Where they book',
                    child: TextInput(
                      initial: _e.externalBookingUrl,
                      hintText: 'https://…',
                      keyboardType: TextInputType.url,
                      onChanged: (v) {
                        _e.externalBookingUrl = v;
                        _changed();
                      },
                    ),
                  ),
                if (_e.takesEntriesHere) ...[
                  Field(
                    label: 'Entries open',
                    optional: true,
                    hint: 'Leave it empty and they are open now.',
                    child: _Clearable(
                      value: _e.bookingOpensAt == null
                          ? null
                          : _moment(_e.bookingOpensAt!),
                      placeholder: 'Pick a date and time',
                      onTap: () => _pickMoment(
                          _e.bookingOpensAt, (v) => _e.bookingOpensAt = v),
                      onClear: () {
                        _e.bookingOpensAt = null;
                        _changed();
                      },
                    ),
                  ),
                  Field(
                    label: 'Entries close',
                    optional: true,
                    child: _Clearable(
                      value: _e.bookingClosesAt == null
                          ? null
                          : _moment(_e.bookingClosesAt!),
                      placeholder: 'Pick a date and time',
                      onTap: () => _pickMoment(
                          _e.bookingClosesAt, (v) => _e.bookingClosesAt = v),
                      onClear: () {
                        _e.bookingClosesAt = null;
                        _changed();
                      },
                    ),
                  ),
                  Field(
                    label: 'Last day to withdraw',
                    optional: true,
                    hint: 'Its own date because "no withdrawals in the last '
                        'week" cannot be said by closing entries early.',
                    child: _Clearable(
                      value: _e.cancellationDeadline == null
                          ? null
                          : _moment(_e.cancellationDeadline!),
                      placeholder: 'Pick a date and time',
                      onTap: () => _pickMoment(_e.cancellationDeadline,
                          (v) => _e.cancellationDeadline = v),
                      onClear: () {
                        _e.cancellationDeadline = null;
                        _changed();
                      },
                    ),
                  ),
                ],
              ],
            ),
            if (_e.takesEntriesHere)
              Section(
                title: 'What they can enter',
                subtitle: 'Most events carry more than one — an under-10 '
                    'singles and an under-14 team, at different fees.',
                children: [
                  CategoriesEditor(
                    items: _e.categories,
                    onChanged: _changed,
                  ),
                ],
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12, left: 4),
                child: Text(
                  _error!,
                  style: const TextStyle(
                      color: A91.danger, fontSize: 13.5, height: 1.5),
                ),
              ),
            PrimaryButton(
              label: _isNew ? 'Save as draft' : 'Save changes',
              busy: _saving,
              onPressed: _saving ? null : () => _save(),
            ),
            if (widget.initial.status != EventStatus.published) ...[
              const SizedBox(height: 10),
              _Secondary(
                label: _isNew ? 'Save and publish' : 'Publish',
                busy: _saving,
                onTap: () => _save(publish: true),
              ),
            ],
            const SizedBox(height: 12),
            const Text(
              'A draft is yours alone. Publishing puts it in front of families '
              'in that city.',
              textAlign: TextAlign.center,
              style: TextStyle(color: A91.faint, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

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

  /// "12 Oct 2026, 09:00".
  static String _moment(DateTime at) {
    final time = TimeOfDay.fromDateTime(at);
    return '${at.day} ${_months[at.month - 1]} ${at.year}, '
        '${time.hour.toString().padLeft(2, '0')}:'
        '${time.minute.toString().padLeft(2, '0')}';
  }
}

/// A date field that can be emptied again. Every optional moment on this form
/// needs that, and a picker alone gives no way back to "not set".
class _Clearable extends StatelessWidget {
  const _Clearable({
    required this.value,
    required this.placeholder,
    required this.onTap,
    required this.onClear,
  });

  final String? value;
  final String placeholder;
  final VoidCallback onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: PickerField(
              value: value,
              placeholder: placeholder,
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

/// Outlined rather than gradient. The gradient belongs to one action per
/// screen, and here that is Save.
class _Secondary extends StatelessWidget {
  const _Secondary({
    required this.label,
    required this.busy,
    required this.onTap,
  });

  final String label;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: busy ? 0.5 : 1,
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: busy ? null : onTap,
            child: Container(
              height: 50,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: A91.grad1),
              ),
              child: Text(
                label,
                style: const TextStyle(
                    color: A91.accentInk,
                    fontWeight: FontWeight.w700,
                    fontSize: 14.5),
              ),
            ),
          ),
        ),
      );
}
