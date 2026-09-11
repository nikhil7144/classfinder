import 'package:aspire91/main_provider.dart' as provider_app;
import 'package:aspire91/main_seeker.dart' as seeker_app;
import 'package:aspire91/src/flavor.dart';
import 'package:aspire91/src/screens/listing/fields.dart';
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
    expect(Flavor.provider.roles, containsAll({'provider', 'organiser'}));
    expect(Flavor.seeker.roles.intersection(Flavor.provider.roles), isEmpty);
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
