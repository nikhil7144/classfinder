import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// The coral-to-gold gradient, spent only here.
///
/// globals.css gives that gradient to primary actions and nothing else, so it
/// lives in one widget rather than being reachable wherever somebody fancies
/// it. A disabled button dims rather than changing colour, because a grey
/// primary action reads as a different control.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;

    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: A91.ctaGradient,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: enabled ? onPressed : null,
            child: SizedBox(
              height: 52,
              child: Center(
                child: busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          valueColor: AlwaysStoppedAnimation(A91.onAccent),
                        ),
                      )
                    : Text(
                        label,
                        style: const TextStyle(
                          color: A91.onAccent,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
