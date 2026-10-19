import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/notification.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/states.dart';
import '../listing/fields.dart';

/// Push/email switches, quiet hours, and per-kind mutes — README §11's
/// "Where it shows in the UI".
///
/// Labels come from `GET /channels`, not a hardcoded list: `entry_received`
/// does not push at all, so a switch implying it does would be a lie, and
/// a kind added on the backend after this shipped should still show up
/// honestly rather than being silently missing from the list.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  NotificationSettings? _settings;
  List<NotificationChannel> _channels = const [];
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final repo = ref.read(notificationsRepositoryProvider);
      final results = await Future.wait([repo.settings(), repo.channels()]);
      if (!mounted) return;
      setState(() {
        _settings = results[0] as NotificationSettings;
        _channels = results[1] as List<NotificationChannel>;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = "Couldn't load your notification settings.");
      }
    }
  }

  Future<void> _patch(Map<String, dynamic> patch) async {
    final current = _settings;
    if (current == null || _saving) return;
    setState(() => _saving = true);
    try {
      final updated = await ref
          .read(notificationsRepositoryProvider)
          .updateSettings(patch);
      if (mounted) setState(() => _settings = updated);
    } catch (_) {
      // The switch below reverts itself on the next build, since _settings
      // never changed — nothing extra to undo here.
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// "HH:mm" → TimeOfDay, for showing a picker pre-set to the saved value.
  TimeOfDay? _parse(String? hhmm) {
    if (hhmm == null) return null;
    final parts = hhmm.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  String _format(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickQuietHour({required bool start}) async {
    final current = _settings;
    if (current == null) return;
    final existing = _parse(start ? current.quietHoursStart : current.quietHoursEnd);
    final picked = await showTimePicker(
      context: context,
      initialTime: existing ?? const TimeOfDay(hour: 21, minute: 0),
    );
    if (picked == null) return;
    _patch({start ? 'quietHoursStart' : 'quietHoursEnd': _format(picked)});
  }

  void _toggleMute(String kind, bool muted) {
    final current = _settings;
    if (current == null) return;
    final next = [...current.mutedKinds];
    if (muted) {
      if (!next.contains(kind)) next.add(kind);
    } else {
      next.remove(kind);
    }
    _patch({'mutedKinds': next});
  }

  @override
  Widget build(BuildContext context) {
    final settings = _settings;

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: SafeArea(
        child: settings == null && _error == null
            ? const Loading()
            : _error != null && settings == null
                ? ErrorState(message: _error!, onRetry: _load)
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                    children: [
                      Section(
                        title: 'How you hear about things',
                        children: [
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('Push notifications'),
                            subtitle: Text(
                              'On this device.',
                              style: TextStyle(color: A91.muted, fontSize: 12.5),
                            ),
                            value: settings!.pushEnabled,
                            onChanged: (v) => _patch({'pushEnabled': v}),
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('Email'),
                            value: settings.emailEnabled,
                            onChanged: (v) => _patch({'emailEnabled': v}),
                          ),
                        ],
                      ),
                      // Not `const`: Section reads A91.surface, and this
                      // screen is reached through a ThemeAware wrapper
                      // specifically so it repaints on a theme change.
                      // ignore: prefer_const_constructors
                      Section(
                        title: 'Quiet hours',
                        subtitle: settings.quietHoursStart != null
                            ? 'No push between ${settings.quietHoursStart} and '
                                '${settings.quietHoursEnd}.'
                            : 'Off — a push can arrive at any time.',
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => _pickQuietHour(start: true),
                                  child: Text(settings.quietHoursStart ?? 'Start'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => _pickQuietHour(start: false),
                                  child: Text(settings.quietHoursEnd ?? 'End'),
                                ),
                              ),
                            ],
                          ),
                          if (settings.quietHoursStart != null) ...[
                            const SizedBox(height: 10),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: () => _patch({
                                  'quietHoursStart': null,
                                  'quietHoursEnd': null,
                                }),
                                child: const Text('Turn off quiet hours'),
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (_channels.isNotEmpty)
                        Section(
                          title: 'What each one does',
                          subtitle: 'Turn off the ones you do not want a push '
                              'for. Everything still shows in this list and in '
                              'email, unless you turned those off above.',
                          children: [
                            for (final c in _channels) ...[
                              _ChannelRow(
                                channel: c,
                                muted: settings.mutedKinds.contains(c.kind),
                                onChanged: c.pushes
                                    ? (v) => _toggleMute(c.kind, v)
                                    : null,
                              ),
                              if (c != _channels.last)
                                Divider(height: 1, color: A91.borderSoft),
                            ],
                          ],
                        ),
                    ],
                  ),
      ),
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({
    required this.channel,
    required this.muted,
    required this.onChanged,
  });

  final NotificationChannel channel;
  final bool muted;

  /// Null when the channel never pushes at all — nothing to switch.
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final label = channel.kind
        .split('_')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(color: A91.ink, fontWeight: FontWeight.w600, fontSize: 13.5)),
                if (channel.note != null) ...[
                  const SizedBox(height: 2),
                  Text(channel.note!,
                      style: TextStyle(color: A91.faint, fontSize: 11.5, height: 1.4)),
                ] else if (!channel.pushes) ...[
                  const SizedBox(height: 2),
                  Text("Doesn't push — email only.",
                      style: TextStyle(color: A91.faint, fontSize: 11.5)),
                ],
              ],
            ),
          ),
          if (onChanged != null)
            Switch(value: !muted, onChanged: (v) => onChanged!(!v))
          else
            const SizedBox(width: 48),
        ],
      ),
    );
  }
}
