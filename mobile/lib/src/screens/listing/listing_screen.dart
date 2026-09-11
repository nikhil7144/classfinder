import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/listing_rules.dart';
import '../../data/models/listing.dart';
import '../../data/models/me.dart';
import '../../data/models/reference.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/states.dart';
import 'fields.dart';
import 'photo_field.dart';
import 'pickers.dart';
import 'repeaters.dart';

/// The coach's listing — /account/profile, and the thing that makes them
/// findable at all.
///
/// One long form rather than a wizard. A coach editing a fee should not have
/// to walk six steps to reach it, and a new one filling it in for the first
/// time can see the whole job in front of them instead of discovering it a
/// page at a time. The section headers carry a dot when something in them is
/// unfinished, which is how somebody knows where to go back to.
///
/// Everything is saved in one call. save_provider_profile() replaces branches
/// and service areas wholesale, so a partial payload would clear what it left
/// out — which is exactly the bug the web had, and the reason that function
/// exists.
class ListingScreen extends ConsumerWidget {
  const ListingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceProvider);
    final listing = ref.watch(myListingProvider);
    final me = ref.watch(meProvider);

    // Three loads, one screen. Any of them failing means no usable form, so
    // they are reported together rather than half-rendered.
    if (reference.isLoading || listing.isLoading || me.isLoading) {
      return const Scaffold(body: Loading());
    }

    final error = reference.error ?? listing.error ?? me.error;
    if (error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Your listing')),
        body: ErrorState(
          message: error is ApiException
              ? error.message
              : 'Something went wrong loading your listing.',
          onRetry: () {
            ref.invalidate(referenceProvider);
            ref.invalidate(myListingProvider);
            ref.invalidate(meProvider);
          },
        ),
      );
    }

    return _ListingForm(
      reference: reference.requireValue,
      // Null means no provider row yet. A blank listing is the starting point,
      // not an error — the first save is what creates the row.
      initial: listing.value ?? Listing(),
      me: me.requireValue,
    );
  }
}

class _ListingForm extends ConsumerStatefulWidget {
  const _ListingForm({
    required this.reference,
    required this.initial,
    required this.me,
  });

  final Reference reference;
  final Listing initial;
  final Me me;

  @override
  ConsumerState<_ListingForm> createState() => _ListingFormState();
}

class _ListingFormState extends ConsumerState<_ListingForm> {
  late final Listing _l = widget.initial;
  late String _phone = widget.me.phone ?? '';

  bool _saving = false;
  String? _error;

  /// Held back until the first save attempt. While somebody is typing, every
  /// field is unfinished, and marking them so from the first keystroke is
  /// nagging rather than help.
  bool _showProblems = false;

  Reference get _ref => widget.reference;

  void _changed() => setState(() {});

  Set<ListingSection> get _bad =>
      _showProblems ? sectionsWithProblems(_l, phone: _phone) : const {};

  Future<void> _save() async {
    final problems = listingProblems(_l, phone: _phone);

    setState(() {
      _showProblems = true;
      _error = problems.isEmpty ? null : problems.first.message;
    });
    // A listing that is not complete is still worth saving — a coach filling
    // this in over two evenings should not lose the first one. But the service
    // marks the profile complete on any successful save, so an incomplete one
    // is refused here rather than quietly publishing half a listing.
    if (problems.isNotEmpty) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      // The phone first. If it fails the listing is untouched, which is the
      // recoverable order: the reverse would save a listing and leave the
      // coach unreachable with no sign that anything was missed.
      if (_phone.trim() != (widget.me.phone ?? '')) {
        await ref.read(meRepositoryProvider).setPhone(_phone.trim());
      }
      await ref.read(listingRepositoryProvider).save(_l);

      ref.invalidate(myListingProvider);
      // /me carries the approval state and the name in the header, and the
      // demand feed needs the provider id a first save has just created.
      ref.invalidate(meProvider);
      ref.invalidate(demandFeedProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(
            widget.initial.id == null
                ? 'Sent for approval. We will let you know.'
                : 'Saved.',
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
      appBar: AppBar(title: const Text('Your listing')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            _StatusBanner(listing: widget.initial),
            _about(),
            _teaching(),
            _where(),
            _fees(),
            _availability(),
            _proof(),
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
            PrimaryButton(
              label: widget.initial.id == null
                  ? 'Send for approval'
                  : 'Save changes',
              busy: _saving,
              onPressed: _saving ? null : _save,
            ),
            const SizedBox(height: 12),
            const Text(
              'An admin reads every new listing before families see it. '
              'Editing an approved one does not send it back.',
              textAlign: TextAlign.center,
              style: TextStyle(color: A91.faint, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  // --- About ---------------------------------------------------------------

  Widget _about() => Section(
        title: 'About you',
        unfinished: _bad.contains(ListingSection.about),
        children: [
          Field(
            label: 'What kind of provider are you',
            hint: 'An academy is located by its branches; an individual by the '
                'areas they serve.',
            child: ChipWrap(
              children: [
                for (final entry in const {
                  'individual': 'Individual coach',
                  'institution': 'Academy or centre',
                  'event_planner': 'Event organiser',
                }.entries)
                  ToggleChip(
                    label: entry.value,
                    selected: _l.providerType == entry.key,
                    onTap: () {
                      if (_l.providerType == entry.key) return;
                      _l.providerType = entry.key;
                      // The category list is per type, so the old choice is
                      // now a row from a different list.
                      _l.providerCategoryId = null;
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          if (!_l.isEventPlanner)
            Field(
              label: 'Your category',
              child: PickerField(
                value: _categoryName(),
                placeholder: 'Choose one',
                onTap: () async {
                  final options = _ref.categoriesFor(_l.providerType);
                  final picked = await pickOne(
                    context,
                    title: 'Your category',
                    selected: _l.providerCategoryId,
                    options: [
                      for (final c in options)
                        PickOption(id: c.id, label: c.name),
                    ],
                  );
                  if (picked == null) return;
                  _l.providerCategoryId = picked;
                  _changed();
                },
              ),
            ),
          Field(
            label: _l.isInstitution ? 'Name of your academy' : 'Your name',
            child: TextInput(
              initial: _l.displayName,
              hintText:
                  _l.isInstitution ? 'Nrityam Dance Academy' : 'Your name',
              maxLength: 120,
              onChanged: (v) {
                _l.displayName = v;
                _changed();
              },
            ),
          ),
          Field(
            label: 'Mobile number',
            hint: 'How families and our team reach you.',
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
            label: 'Short bio',
            hint: 'A few lines about you and how you teach.',
            child: TextInput(
              initial: _l.bio,
              maxLines: 5,
              maxLength: 2000,
              hintText: 'I have taught Kathak in Vijay Nagar for eleven years…',
              onChanged: (v) {
                _l.bio = v;
                _changed();
              },
            ),
          ),
          if (!_l.isEventPlanner)
            Field(
              label: 'How you help',
              hint: 'One sentence. This is what a parent reads first.',
              child: TextInput(
                initial: _l.helpStatement,
                maxLines: 3,
                maxLength: 500,
                hintText: 'I get nervous beginners comfortable on stage.',
                onChanged: (v) {
                  _l.helpStatement = v;
                  _changed();
                },
              ),
            ),
          Field(
            label: 'Your age',
            optional: true,
            child: TextInput(
              initial: _l.age,
              digitsOnly: true,
              maxLength: 3,
              hintText: '34',
              onChanged: (v) {
                _l.age = v;
                _changed();
              },
            ),
          ),
        ],
      );

  String? _categoryName() {
    final id = _l.providerCategoryId;
    if (id == null) return null;
    for (final c in _ref.providerCategories) {
      if (c.id == id) return c.name;
    }
    return null;
  }

  // --- Teaching ------------------------------------------------------------

  Widget _teaching() => Section(
        title: 'What you teach',
        unfinished: _bad.contains(ListingSection.teaching),
        children: [
          Field(
            label: 'Years of experience',
            child: TextInput(
              initial: _l.experienceYears,
              digitsOnly: true,
              maxLength: 2,
              hintText: '11',
              onChanged: (v) {
                _l.experienceYears = v;
                _changed();
              },
            ),
          ),
          Field(
            label: 'What you teach or coach',
            hint: 'Pick everything you actually take. This is what families '
                'search by.',
            child: _MultiPick(
              chosen: _l.serviceCategoryIds,
              emptyLabel: 'Choose subjects, sports or art forms',
              labelFor: _ref.serviceName,
              dotFor: (id) => A91.group(_ref.service(id)?.group),
              onTap: () async {
                final picked = await pickMany(
                  context,
                  title: 'What you teach',
                  subtitle:
                      'Families search by these. Pick every one you take.',
                  selected: _l.serviceCategoryIds.toSet(),
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
                _l.serviceCategoryIds = picked.toList();
                _changed();
              },
            ),
          ),
          if (!_l.isEventPlanner)
            Field(
              label: 'How you run your classes',
              hint: 'The format — not the venue. That is the next section.',
              child: ChipWrap(
                children: [
                  for (final place in _ref.teachingPlaces)
                    ToggleChip(
                      label: place.label,
                      selected: _l.teachingPlaces.contains(place.id),
                      onTap: () {
                        if (_l.teachingPlaces.contains(place.id)) {
                          _l.teachingPlaces.remove(place.id);
                          // A slot at a place they no longer offer is a
                          // promise they cannot keep.
                          _l.availability
                              .removeWhere((s) => s.place == place.id);
                        } else {
                          _l.teachingPlaces.add(place.id);
                        }
                        _changed();
                      },
                    ),
                ],
              ),
            ),
        ],
      );

  // --- Where ---------------------------------------------------------------

  Widget _where() => Section(
        title: 'Where you work',
        subtitle: _l.isInstitution
            ? 'Each branch carries its own area. This is what puts you in front '
                'of families nearby.'
            : 'The areas you will travel to or teach in.',
        unfinished: _bad.contains(ListingSection.where),
        children: [
          if (_l.isInstitution)
            BranchesEditor(
              items: _l.branches,
              reference: _ref,
              onChanged: _changed,
            )
          else ...[
            if (!_l.isEventPlanner)
              Field(
                label: 'Do you travel to students',
                hint: 'Whether you go to them, or they come to you.',
                child: ChipWrap(
                  children: [
                    ToggleChip(
                      label: 'I travel to them',
                      selected: _l.travelsToStudents == true,
                      onTap: () {
                        _l.travelsToStudents = true;
                        _changed();
                      },
                    ),
                    ToggleChip(
                      label: 'They come to me',
                      selected: _l.travelsToStudents == false,
                      onTap: () {
                        _l.travelsToStudents = false;
                        _changed();
                      },
                    ),
                  ],
                ),
              ),
            Field(
              label: 'Areas you serve',
              child: _MultiPick(
                chosen: _l.serviceAreaIds,
                emptyLabel: 'Choose your areas',
                labelFor: _ref.areaLabel,
                onTap: () async {
                  final picked = await pickMany(
                    context,
                    title: 'Areas you serve',
                    subtitle: 'An area that has not opened to families yet can '
                        'still be chosen — you will be there when it does.',
                    selected: _l.serviceAreaIds.toSet(),
                    options: areaOptions(_ref),
                  );
                  if (picked == null) return;
                  _l.serviceAreaIds = picked.toList();
                  _changed();
                },
              ),
            ),
          ],
        ],
      );

  // --- Fees ----------------------------------------------------------------

  Widget _fees() => Section(
        title: 'Fees',
        subtitle:
            'Optional, and the first thing most parents look for. A range '
            'is fine.',
        unfinished: _bad.contains(ListingSection.fees),
        children: [
          Row(
            children: [
              Expanded(
                child: Field(
                  label: 'From',
                  optional: true,
                  child: TextInput(
                    initial: _l.feeMin,
                    digitsOnly: true,
                    hintText: '1500',
                    onChanged: (v) {
                      _l.feeMin = v;
                      _changed();
                    },
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Field(
                  label: 'To',
                  optional: true,
                  child: TextInput(
                    initial: _l.feeMax,
                    digitsOnly: true,
                    hintText: '3000',
                    onChanged: (v) {
                      _l.feeMax = v;
                      _changed();
                    },
                  ),
                ),
              ),
            ],
          ),
          Field(
            label: 'Per',
            optional: true,
            child: ChipWrap(
              children: [
                for (final entry in feePeriods.entries)
                  ToggleChip(
                    label: entry.value,
                    selected: _l.feePeriod == entry.key,
                    onTap: () {
                      _l.feePeriod =
                          _l.feePeriod == entry.key ? null : entry.key;
                      _changed();
                    },
                  ),
              ],
            ),
          ),
          Field(
            label: 'Anything to add',
            optional: true,
            hint: 'Sibling discounts, trial classes, what the fee includes.',
            child: TextInput(
              initial: _l.feesNote,
              maxLines: 3,
              maxLength: 500,
              hintText: 'First class free. 10% off for siblings.',
              onChanged: (v) {
                _l.feesNote = v;
                _changed();
              },
            ),
          ),
        ],
      );

  // --- Availability --------------------------------------------------------

  Widget _availability() => Section(
        title: 'When you teach',
        subtitle: 'Optional, and it saves both sides a conversation.',
        unfinished: _bad.contains(ListingSection.availability),
        children: [
          AvailabilityEditor(
            items: _l.availability,
            places: _l.teachingPlaces,
            reference: _ref,
            onChanged: _changed,
          ),
        ],
      );

  // --- Proof ---------------------------------------------------------------

  Widget _proof() => Section(
        title: 'Photo and credentials',
        unfinished: _bad.contains(ListingSection.proof),
        children: [
          PhotoField(
            url: _l.photoUrl,
            onUploaded: (url) {
              _l.photoUrl = url;
              _changed();
            },
          ),
          const SizedBox(height: 22),
          Field(
            label: 'Certifications',
            optional: true,
            hint: 'Degrees, gradings, coaching badges — whatever you would '
                'mention to a parent.',
            child: CertificationsEditor(
              items: _l.certifications,
              onChanged: _changed,
            ),
          ),
        ],
      );
}

/// A row of chips for whatever is currently picked, and a tap to change it.
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

/// Where the listing stands: waiting, live, or taken down.
///
/// Suspended and not-yet-approved are different things and are said
/// differently — one is a queue, the other is a decision.
class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.listing});

  final Listing listing;

  @override
  Widget build(BuildContext context) {
    if (listing.id == null) {
      return const _Banner(
        tone: A91.faint,
        title: 'Not published yet',
        body: 'Fill this in and send it. An admin reads every new listing '
            'before families see it.',
      );
    }
    if (listing.isSuspended) {
      return const _Banner(
        tone: A91.danger,
        title: 'Taken down',
        body: 'Your listing is not visible to families. Write to '
            'support@aspire91.com and we will go through it with you.',
      );
    }
    if (!listing.approved) {
      return const _Banner(
        tone: A91.warn,
        title: 'Waiting for approval',
        body: 'We are reading it. You can keep editing in the meantime.',
      );
    }
    return const _Banner(
      tone: A91.teal,
      title: 'Live',
      body: 'Families can find you. Edits go up without waiting for approval '
          'again.',
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.tone, required this.title, required this.body});

  final Color tone;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: tone.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                  color: tone, fontWeight: FontWeight.w700, fontSize: 14.5),
            ),
            const SizedBox(height: 5),
            Text(body,
                style: const TextStyle(
                    color: A91.muted, fontSize: 13, height: 1.5)),
          ],
        ),
      );
}
