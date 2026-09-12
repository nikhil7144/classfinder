import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/group.dart';
import '../../data/models/reference.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import '../listing/fields.dart';
import '../listing/pickers.dart';
import '../listing/repeaters.dart' show areaOptions;

/// Starting a group — /groups/new.
///
/// Short on purpose. A parent doing this is usually doing it from a building
/// WhatsApp group with four people waiting, and every field they have to think
/// about is one more chance to close the app.
class GroupFormScreen extends ConsumerWidget {
  const GroupFormScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceProvider);

    return reference.when(
      loading: () => const Scaffold(body: FormSkeleton(sections: 2)),
      error: (error, _) => Scaffold(
        appBar: AppBar(title: const Text('Start a group')),
        body: ErrorState(
          message: error is ApiException
              ? error.message
              : 'Something went wrong loading the form.',
          onRetry: () => ref.invalidate(referenceProvider),
        ),
      ),
      data: (reference) => _Form(reference: reference),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.reference});

  final Reference reference;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  String? _serviceId;
  String? _areaId;
  String _society = '';
  String _notes = '';
  int _studentCount = groupMinStudents;
  bool _sharePhone = false;
  int _validityDays = 10;

  bool _saving = false;
  String? _error;

  Reference get _ref => widget.reference;

  /// Start where the family already said they were looking, and with what they
  /// already said they wanted.
  @override
  void initState() {
    super.initState();
    final profile = ref.read(myProfileProvider).value;
    _areaId = profile?.areaId;
    _serviceId = profile?.lookingFor.firstOrNull;
  }

  String? get _problem {
    if (_serviceId == null) return 'Choose what the group wants taught.';
    if (_areaId == null) return 'Choose the area you are all in.';
    if (_society.trim().length < 2) {
      return 'Name the society or building — it is how neighbours recognise '
          'their own group.';
    }
    return null;
  }

  Future<void> _save() async {
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
      await ref.read(groupsRepositoryProvider).create(
            serviceCategoryId: _serviceId!,
            areaId: _areaId!,
            societyName: _society,
            notes: _notes,
            studentCount: _studentCount,
            sharePhone: _sharePhone,
            validityDays: _validityDays,
          );

      ref.invalidate(myGroupsProvider);
      ref.invalidate(alertsProvider);

      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Start a group')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            Section(
              title: 'What and where',
              subtitle: 'Coaches in this area will see it and pitch to all of '
                  'you at once.',
              children: [
                Field(
                  label: 'What do you want taught',
                  child: PickerField(
                    value: _serviceId == null
                        ? null
                        : _ref.serviceName(_serviceId!),
                    placeholder: 'Choose one',
                    onTap: () async {
                      final picked = await pickOne(
                        context,
                        title: 'What the group wants',
                        selected: _serviceId,
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
                      setState(() => _serviceId = picked);
                    },
                  ),
                ),
                Field(
                  label: 'Your area',
                  child: PickerField(
                    value: _areaId == null ? null : _ref.areaLabel(_areaId!),
                    placeholder: 'Choose an area',
                    onTap: () async {
                      final picked = await pickOne(
                        context,
                        title: 'Where you all are',
                        selected: _areaId,
                        options: areaOptions(_ref),
                      );
                      if (picked == null) return;
                      setState(() => _areaId = picked);
                    },
                  ),
                ),
                Field(
                  label: 'Society or building',
                  hint: 'Never shown outside the group — it is how your '
                      'neighbours know it is theirs.',
                  child: TextInput(
                    initial: _society,
                    hintText: 'Shipra Sun City',
                    maxLength: 160,
                    onChanged: (v) => setState(() => _society = v),
                  ),
                ),
              ],
            ),
            Section(
              title: 'How many, and for how long',
              children: [
                Field(
                  label: 'Places you are asking for',
                  hint: 'At least two — one family on its own is an enquiry, '
                      'not a group.',
                  child: _Counter(
                    value: _studentCount,
                    min: groupMinStudents,
                    max: 100,
                    onChanged: (v) => setState(() => _studentCount = v),
                  ),
                ),
                Field(
                  label: 'How long it runs',
                  hint: 'Coaches stop seeing it after this. You can extend it '
                      'whenever.',
                  child: ChipWrap(
                    children: [
                      for (final e in groupValidityOptions.entries)
                        ToggleChip(
                          label: e.value,
                          selected: _validityDays == e.key,
                          onTap: () => setState(() => _validityDays = e.key),
                        ),
                    ],
                  ),
                ),
                Field(
                  label: 'Anything else',
                  optional: true,
                  hint: 'Days that suit you, ages, what you have tried.',
                  child: TextInput(
                    initial: _notes,
                    maxLines: 4,
                    maxLength: 1000,
                    hintText: 'Four children, 8 to 10, Saturday mornings would '
                        'suit us best.',
                    onChanged: (v) => setState(() => _notes = v),
                  ),
                ),
              ],
            ),
            Section(
              title: 'Your number',
              children: [
                _Switch(
                  value: _sharePhone,
                  title: 'Let coaches see my number',
                  body: 'Only coaches who pitch to this group, and only after '
                      'you accept them. Off by default, and you can change it '
                      'later.',
                  onChanged: (v) => setState(() => _sharePhone = v),
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
              label: 'Start it',
              busy: _saving,
              onPressed: _saving ? null : _save,
            ),
            const SizedBox(height: 12),
            const Text(
              'You will get a link to send your neighbours. Coaches only see '
              'the group once enough families have joined.',
              textAlign: TextAlign.center,
              style: TextStyle(color: A91.faint, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// A number picked by tapping rather than typed. Two to a hundred is a range
/// where a keyboard is more work than two buttons.
class _Counter extends StatelessWidget {
  const _Counter({
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          _Step(
            icon: Icons.remove,
            onTap: value > min ? () => onChanged(value - 1) : null,
          ),
          SizedBox(
            width: 64,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: A91.ink,
                fontSize: 19,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          _Step(
            icon: Icons.add,
            onTap: value < max ? () => onChanged(value + 1) : null,
          ),
        ],
      );
}

class _Step extends StatelessWidget {
  const _Step({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: onTap == null ? 0.4 : 1,
        child: Material(
          color: A91.surface2,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Container(
              height: 42,
              width: 42,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: A91.border),
              ),
              child: Icon(icon, size: 19, color: A91.muted),
            ),
          ),
        ),
      );
}

class _Switch extends StatelessWidget {
  const _Switch({
    required this.value,
    required this.title,
    required this.body,
    required this.onChanged,
  });

  final bool value;
  final String title;
  final String body;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Material(
        color: A91.surface2,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => onChanged(!value),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            decoration: BoxDecoration(
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
                      Text(
                        title,
                        style: const TextStyle(
                          color: A91.ink,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        body,
                        style: const TextStyle(
                            color: A91.faint, fontSize: 12, height: 1.45),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: value,
                  onChanged: onChanged,
                  activeThumbColor: A91.onAccent,
                  activeTrackColor: A91.grad1,
                ),
              ],
            ),
          ),
        ),
      );
}
