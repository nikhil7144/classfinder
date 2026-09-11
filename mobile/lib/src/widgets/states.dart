import 'package:flutter/material.dart';

import '../theme/theme.dart';
import 'primary_button.dart';

/// Waiting. One spinner, so every screen waits the same way.
class Loading extends StatelessWidget {
  const Loading({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: SizedBox(
          height: 26,
          width: 26,
          child: CircularProgressIndicator(strokeWidth: 2.4, color: A91.faint),
        ),
      );
}

/// Something failed, said in the words the service used.
///
/// The message is passed in rather than composed here: the API answers a
/// refusal with a sentence worth showing, and replacing it with "Something
/// went wrong" throws away the most precise thing anyone knows.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: A91.muted, height: 1.55),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: 20),
                SizedBox(
                  width: 160,
                  child: PrimaryButton(label: 'Try again', onPressed: onRetry),
                ),
              ],
            ],
          ),
        ),
      );
}

/// Nothing here yet, and that is fine.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              Text(
                body,
                textAlign: TextAlign.center,
                style: const TextStyle(color: A91.muted, height: 1.6),
              ),
            ],
          ),
        ),
      );
}
