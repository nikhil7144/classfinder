import 'package:aspire91/main_provider.dart' as provider_app;
import 'package:aspire91/main_seeker.dart' as seeker_app;
import 'package:aspire91/src/flavor.dart';
import 'package:aspire91/src/screens/listing/fields.dart';
import 'package:aspire91/src/widgets/skeleton.dart';
import 'package:aspire91/src/theme/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A compile check with a pulse.
///
/// There is no Android SDK on the machine this was written on, so `flutter
/// build` cannot run here and this is the closest thing to proof that the tree
/// holds together: importing both entry points drags in every screen, every
/// repository and the router, and anything that will not compile fails here
/// rather than on the app developer's first build.
///
/// It deliberately does not pump a whole app. That would need a Supabase
/// session and a live API, which is an integration test and a different job.
void main() {
  test('both flavor entry points compile and are distinct', () {
    // Referenced so the imports are not dead — this is the point of the file.
    expect(provider_app.main, isNotNull);
    expect(seeker_app.main, isNotNull);
  });

  test('a flavor admits only the roles that belong to it', () {
    // The rule the whole packaging rests on: one account is one role, so an
    // account in the wrong app is told plainly rather than offered a switch.
    expect(Flavor.seeker.roles, {'seeker'});
    expect(Flavor.provider.roles, {'provider'});
    expect(Flavor.seeker.roles.intersection(Flavor.provider.roles), isEmpty);
  });

  test('no flavor admits an organiser or an admin', () {
    // Organiser was in the provider flavor and was taken out: it shares none
    // of what the coach app does, so four of five tabs were empty and the
    // fifth offered a coach listing an organiser must not create. Both roles
    // work on the website.
    for (final flavor in Flavor.values) {
      expect(flavor.roles, isNot(contains('organiser')), reason: flavor.name);
      expect(flavor.roles, isNot(contains('admin')), reason: flavor.name);
    }
  });

  testWidgets('the design system widgets render under the app theme',
      (tester) async {
    var tapped = false;

    await tester.pumpWidget(MaterialApp(
      theme: A91.theme(),
      home: Scaffold(
        body: Section(
          title: 'About you',
          unfinished: true,
          children: [
            Field(
              label: 'Your name',
              child: ToggleChip(
                label: 'Individual coach',
                selected: true,
                onTap: () => tapped = true,
              ),
            ),
          ],
        ),
      ),
    ));

    expect(find.text('ABOUT YOU'), findsOneWidget);
    expect(find.text('Your name'), findsOneWidget);

    await tester.tap(find.text('Individual coach'));
    expect(tapped, isTrue);
  });

  testWidgets('a skeleton pulses without ever vanishing', (tester) async {
    // Never to zero: a block that disappears reads as a flash rather than a
    // pulse, and the layout has to stay legible throughout.
    await tester.pumpWidget(MaterialApp(
      theme: A91.theme(),
      home: const Scaffold(body: ListSkeleton(rows: 2)),
    ));

    // Scoped to the Pulse: the page transition puts a FadeTransition of its
    // own in the tree, and `.first` finds that one.
    double opacity() => tester
        .widget<FadeTransition>(
          find.descendant(
            of: find.byType(Pulse),
            matching: find.byType(FadeTransition),
          ),
        )
        .opacity
        .value;

    expect(opacity(), 1.0);
    await tester.pump(const Duration(milliseconds: 700));
    expect(opacity(), lessThan(1.0));
    expect(opacity(), greaterThanOrEqualTo(0.45));

    // Leave it settled, or the repeating controller keeps the test pending.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the form skeleton lays out the sections it is asked for',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: A91.theme(),
      home: const Scaffold(body: FormSkeleton(sections: 3, fields: 2)),
    ));

    expect(find.byType(SkeletonPanel), findsNWidgets(3));
    await tester.pumpWidget(const SizedBox());
  });

  test('one page transition is set for both platforms', () {
    // Flutter's defaults differ per platform, so the two would match neither
    // each other nor the web unless this is stated.
    final builders = A91.theme().pageTransitionsTheme.builders;
    expect(builders[TargetPlatform.android], isNotNull);
    expect(builders[TargetPlatform.iOS], isNotNull);
    expect(builders[TargetPlatform.android].runtimeType,
        builders[TargetPlatform.iOS].runtimeType);
  });

  test('every taxonomy group has its own colour, and an unknown one falls back',
      () {
    const groups = [
      'sport',
      'wellness',
      'mind',
      'indoor',
      'dance',
      'music',
      'subject',
      'exam',
      'acting',
    ];

    final colours = groups.map(A91.group).toSet();
    expect(colours, hasLength(groups.length));

    // A group added to the taxonomy after this shipped must not throw.
    expect(A91.group('something-new'), A91.muted);
    expect(A91.group(null), A91.muted);
  });
}
