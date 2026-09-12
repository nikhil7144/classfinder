import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/location.dart';
import '../../data/models/me.dart';
import '../../data/models/reference.dart';
import '../../data/models/seeker.dart';
import '../../data/seeker_rules.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import '../listing/fields.dart';
import '../listing/pickers.dart';
import '../listing/repeaters.dart' show areaOptions;
import 'photo_field.dart';

/// A family's profile — /complete-profile/seeker and /account/profile.
///
/// One form doing two jobs, because the web's does: who you are, and what you
/// want. They save together in one call, and the second half is only required
/// of somebody who has asked to be found.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceProvider);
    final profile = ref.watch(myProfileProvider);
    final me = ref.watch(meProvider);

    if (reference.isLoading || profile.isLoading || me.isLoading) {
      return const Scaffold(body: FormSkeleton(sections: 3));
    }

    final error = reference.error ?? profile.error ?? me.error;
    if (error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Your profile')),
        body: ErrorState(
          message: error is ApiException
              ? error.message
              : 'Something went wrong loading your profile.',
          onRetry: () {
            ref.invalidate(referenceProvider);
            ref.invalidate(myProfileProvider);
            ref.invalidate(meProvider);
          },
        ),
      );
    }

    return _Form(
      reference: reference.requireValue,
      // Null means no row yet. A blank profile is the starting point, not an
      // error — the first save writes the row.
      initial: profile.value ?? SeekerProfile(),
      me: me.requireValue,
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({
    required this.reference,
    required this.initial,
    required this.me,
  });

  final Reference reference;
  final SeekerProfile initial;
  final Me me;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  late final SeekerProfile _p = widget.initial;
  late String _phone = widget.me.phone ?? '';

  bool _saving = false;
  bool _locating = false;
  String? _error;
  String? _locationNote;

  /// Held back until the first save attempt, for the same reason the listing
  /// form holds it back: while somebody is typing, everything is unfinished.
  bool _showProblems = false;

  Reference get _ref => widget.reference;

  void _changed() => setState(() {});

  Set<SeekerSection> get _bad =>
      _showProblems ? seekerSectionsWithProblems(_p, phone: _phone) : const {};

  Future<void> _locate() async {
    setState(() {
      _locating = true;
      _locationNote = null;
    });

    final result = await findMe();
    if (!mounted) return;

    setState(() {
      _locating = false;
      if (result.ok) {
        _p.lat = result.position!.lat;
        _p.lng = result.position!.lng;
        _locationNote = 'Got it. Coaches will be sorted from where you are.';
      } else {
        _locationNote = result.message;
      }
    });
  }

  Future<void> _save() async {
    final problems = seekerProblems(_p, phone: _phone);

    setState(() {
      _showProblems = true;
      _error = problems.isEmpty ? null : problems.first.message;
    });
    if (problems.isNotEmpty) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      // The phone first. If it fails the profile is untouched, which is the
      // recoverable order — the coach side saves in the same sequence.
      if (_phone.trim() != (widget.me.phone ?? '')) {
        await ref.read(meRepositoryProvider).setPhone(_phone.trim());
      }
      await ref.read(seekerRepositoryProvider).save(_p);

      ref.invalidate(myProfileProvider);
      ref.invalidate(meProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(
            widget.initial.id == null ? 'All set.' : 'Saved.',
            style: const TextStyle(color: A91.ink),
          ),
        ),
      );
      Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            _about(),
            _requirement(),
            _consents(),
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
              label: widget.initial.id == null ? 'Save and start' : 'Save',
              busy: _saving,
              onPressed: _saving ? null : _save,
            ),
          ],
        ),
      ),
    );
  }

  // --- Who you are ---------------------------------------------------------

  Widget _about() => Section(
        title: 'About you',
        unfinished: _bad.contains(SeekerSection.about),
        children: [
          Field(
            label: 'Your name',
            child: TextInput(
              initial: _p.name,
              hintText: 'Nikhil Gupta',
              maxLength: 120,
              onChanged: (v) {
                _p.name = v;
                _changed();
              },
            ),
          ),
          Field(
            label: 'Who are you looking for',
            hint: 'It changes what a coach is being asked to do — teaching a '
                'grown beginner and teaching a six-year-old are different jobs.',
            child: PickerField(
              value: relations[_p.relationToLearner],
              placeholder: 'Choose one',
              onTap: () async {
                final picked = await pickOne(
                  context,
                  title: 'Who are you looking for',
                  selected: _p.relationToLearner,
                  options: [
                    for (final e in relations.entries)
                      PickOption(id: e.key, label: e.value),
                  ],
                );
                if (picked == null) return;
                _p.relationToLearner = picked;
                _changed();
              },
            ),
          ),
          Field(
            label: 'Mobile number',
            hint: 'Only shared with a coach when you choose to, per '
                'conversation.',
            child: TextInput(
              initial: _phone,
              hintText: '98765 43210',
              keyboardType: TextInputType.phone,
              onChanged: (v) {
                _phone = v;
                _changed();
              },
            ),
          ),
          Field(
            label: 'Where are you looking',
            child: PickerField(
              value: _p.areaId == null ? null : _ref.areaLabel(_p.areaId!),
              placeholder: 'Choose your area',
              onTap: () async {
                final picked = await pickOne(
                  context,
                  title: 'Where are you looking',
                  subtitle: 'Search is centred here.',
                  selected: _p.areaId,
                  options: areaOptions(_ref),
                );
                if (picked == null) return;
                _p.areaId = picked;
                _changed();
              },
            ),
          ),
          // Optional, and it stays optional: the area's centroid is the
          // fallback and the note under the button says so.
          _LocationRow(
            has: _p.lat != null,
            busy: _locating,
            note: _locationNote,
            onTap: _locate,
          ),
          const SizedBox(height: 18),
          Field(
            label: 'Photo',
            optional: true,
            child: SeekerPhotoField(
              url: _p.photoUrl,
              onUploaded: (url) {
                _p.photoUrl = url;
                _changed();
              },
            ),
          ),
        ],
      );

  // --- What you want -------------------------------------------------------

  Widget _requirement() => Section(
        title: 'What you are looking for',
        subtitle: _p.openToOffers
            ? 'Coaches near you read this and get in touch. The more you say, '
                'the better the match.'
            : 'Optional while you are not open to being approached — fill it '
                'in whenever you like.',
        unfinished: _bad.contains(SeekerSection.requirement),
        children: [
          Field(
            label: 'What are you looking for',
            child: _MultiPick(
              chosen: _p.lookingFor,
              emptyLabel: 'Choose subjects, sports or art forms',
              labelFor: _ref.serviceName,
              dotFor: (id) => A91.group(_ref.service(id)?.group),
              onTap: () async {
                final picked = await pickMany(
                  context,
                  title: 'What are you looking for',
                  selected: _p.lookingFor.toSet(),
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
                _p.lookingFor = picked.toList();
                _changed();
              },
            ),
          ),
          Field(
            label: 'How old is the learner',
            optional: true,
            child: TextInput(
              initial: _p.learnerAge,
              digitsOnly: true,
              maxLength: 2,
              hintText: '9',
              onChanged: (v) {
                _p.learnerAge = v;
                _changed();
              },
            ),
          ),
          Field(
            label: 'Where they are now',
            optional: true,
            child: ChipWrap(
              children: [
                for (final e in levels.entries)
                  ToggleChip(
                    label: e.value,
                    selected: _p.level == e.key,
                    onTap: () {
                      _p.level = _p.level == e.key ? null : e.key;
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          Field(
            label: 'How would you like classes to run',
            optional: true,
            child: ChipWrap(
              children: [
                for (final e in teachingModes.entries)
                  ToggleChip(
                    label: e.value,
                    selected: _p.preferredModes.contains(e.key),
                    onTap: () {
                      _p.preferredModes.contains(e.key)
                          ? _p.preferredModes.remove(e.key)
                          : _p.preferredModes.add(e.key);
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          Field(
            label: 'Which days suit you',
            optional: true,
            child: ChipWrap(
              children: [
                for (final e in weekDayLabels.entries)
                  ToggleChip(
                    label: e.value,
                    selected: _p.preferredDays.contains(e.key),
                    onTap: () {
                      _p.preferredDays.contains(e.key)
                          ? _p.preferredDays.remove(e.key)
                          : _p.preferredDays.add(e.key);
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          Field(
            label: 'What time of day',
            optional: true,
            child: ChipWrap(
              children: [
                for (final e in preferredTimes.entries)
                  ToggleChip(
                    label: e.value,
                    selected: _p.preferredTime == e.key,
                    onTap: () {
                      _p.preferredTime =
                          _p.preferredTime == e.key ? null : e.key;
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          Field(
            label: 'Roughly what were you thinking',
            optional: true,
            hint: 'A range is fine, and it saves both sides a conversation.',
            child: Row(
              children: [
                Expanded(
                  child: TextInput(
                    initial: _p.budgetMin,
                    digitsOnly: true,
                    hintText: 'From ₹',
                    onChanged: (v) {
                      _p.budgetMin = v;
                      _changed();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextInput(
                    initial: _p.budgetMax,
                    digitsOnly: true,
                    hintText: 'To ₹',
                    onChanged: (v) {
                      _p.budgetMax = v;
                      _changed();
                    },
                  ),
                ),
              ],
            ),
          ),
          Field(
            label: 'Per',
            optional: true,
            child: ChipWrap(
              children: [
                for (final e in budgetPeriods.entries)
                  ToggleChip(
                    label: e.value,
                    selected: _p.budgetPeriod == e.key,
                    onTap: () {
                      _p.budgetPeriod = _p.budgetPeriod == e.key ? null : e.key;
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          Field(
            label: 'Anything else',
            optional: true,
            child: TextInput(
              initial: _p.requirementNotes,
              maxLines: 4,
              maxLength: 1000,
              hintText: 'My son is 9 and has never played before. Weekends '
                  'would suit us best.',
              onChanged: (v) {
                _p.requirementNotes = v;
                _changed();
              },
            ),
          ),
        ],
      );

  // --- The two switches ----------------------------------------------------

  Widget _consents() => Section(
        title: 'What we may do',
        children: [
          _Switch(
            value: _p.openToOffers,
            title: 'Let coaches get in touch',
            body: 'Coaches near you can see what you are looking for and '
                'write to you. Turn it off and you disappear from their list '
                'straight away — you can still search and message anyone '
                'yourself.',
            onChanged: (v) {
              _p.openToOffers = v;
              _changed();
            },
          ),
          const SizedBox(height: 12),
          _Switch(
            value: _p.marketingOptIn,
            title: 'Send me occasional updates',
            body: 'New coaches and events in your area. Nothing else, and you '
                'can turn it off whenever.',
            onChanged: (v) {
              _p.marketingOptIn = v;
              _changed();
            },
          ),
        ],
      );
}

class _LocationRow extends StatelessWidget {
  const _LocationRow({
    required this.has,
    required this.busy,
    required this.note,
    required this.onTap,
  });

  final bool has;
  final bool busy;
  final String? note;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: busy ? null : onTap,
              icon: busy
                  ? const SizedBox(
                      height: 15,
                      width: 15,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: A91.faint),
                    )
                  : const Icon(Icons.my_location, size: 17, color: A91.grad2),
              label: Text(
                busy
                    ? 'Locating…'
                    : has
                        ? 'Update my location'
                        : 'Use my location',
                style: const TextStyle(
                    color: A91.grad2, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          if (note != null)
            Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Text(
                note!,
                style: const TextStyle(
                    color: A91.faint, fontSize: 12, height: 1.45),
              ),
            ),
        ],
      );
}

/// A consent switch, said in plain words with the consequence under it.
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

/// Chips for what is picked, and a tap to change it. The listing form has the
/// same widget; it is private there, and duplicating eleven lines beats
/// exporting a private class across two screens that may yet diverge.
class _MultiPick extends StatelessWidget {
  const _MultiPick({
    required this.chosen,
    required this.emptyLabel,
    required this.labelFor,
    required this.onTap,
    this.dotFor,
  });

  final List<String> chosen;
  final String emptyLabel;
  final String Function(String id) labelFor;
  final Color Function(String id)? dotFor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (chosen.isEmpty) {
      return PickerField(value: null, placeholder: emptyLabel, onTap: onTap);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ChipWrap(
          children: [
            for (final id in chosen)
              ToggleChip(
                label: labelFor(id),
                selected: true,
                dot: dotFor?.call(id),
                onTap: onTap,
              ),
          ],
        ),
        const SizedBox(height: 10),
        GestureDetector(
          onTap: onTap,
          child: const Text(
            'Change',
            style: TextStyle(
                color: A91.grad2, fontSize: 12.5, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
