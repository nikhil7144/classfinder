import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/api_exception.dart';
import '../../data/supabase.dart';
import '../../providers.dart';
import '../../theme/theme.dart';

/// The coach's face, uploaded straight to Storage.
///
/// Not through the API: file bytes are the second door PLAN.md keeps open, and
/// posting a few megabytes to a Node process so it can hand them to the same
/// bucket is a hop that helps nobody.
///
/// It uploads on pick rather than on save. A photo is the slowest part of this
/// form, and doing it inside the save means the coach waits twice as long at
/// the one moment they are watching — and a failed upload would take the whole
/// listing down with it.
class PhotoField extends ConsumerStatefulWidget {
  const PhotoField({super.key, required this.url, required this.onUploaded});

  final String? url;
  final ValueChanged<String> onUploaded;

  @override
  ConsumerState<PhotoField> createState() => _PhotoFieldState();
}

class _PhotoFieldState extends ConsumerState<PhotoField> {
  bool _busy = false;
  String? _error;

  /// Held so the new photo shows immediately. The public URL is the same path
  /// every time, and some caches take a moment to notice the cache-buster.
  File? _local;

  Future<void> _pick(ImageSource source) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    final picked = await ImagePicker().pickImage(
      source: source,
      // A profile photo is shown at 120px. Sending a 12-megapixel original
      // costs the coach their data and the bucket its quota for no gain.
      maxWidth: 1200,
      maxHeight: 1200,
      imageQuality: 85,
    );
    if (picked == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final url = await ref
          .read(listingRepositoryProvider)
          .uploadPhoto(File(picked.path), userId: userId);
      if (!mounted) return;
      setState(() => _local = File(picked.path));
      widget.onUploaded(url);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _choose() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: A91.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            ListTile(
              leading:
                  const Icon(Icons.photo_camera_outlined, color: A91.muted),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading:
                  const Icon(Icons.photo_library_outlined, color: A91.muted),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (source != null) await _pick(source);
  }

  @override
  Widget build(BuildContext context) {
    final has = _local != null || (widget.url?.isNotEmpty ?? false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            GestureDetector(
              onTap: _busy ? null : _choose,
              child: Container(
                height: 86,
                width: 86,
                decoration: BoxDecoration(
                  color: A91.surface2,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: A91.border),
                  image: !has
                      ? null
                      : DecorationImage(
                          image: _local != null
                              ? FileImage(_local!)
                              : NetworkImage(widget.url!) as ImageProvider,
                          fit: BoxFit.cover,
                        ),
                ),
                alignment: Alignment.center,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: A91.faint),
                      )
                    : has
                        ? null
                        : const Icon(Icons.add_a_photo_outlined,
                            color: A91.faint, size: 24),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    has ? 'Looking good.' : 'Add a photo of yourself.',
                    style: const TextStyle(
                        color: A91.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 5),
                  const Text(
                    'Parents are choosing who to trust with their child. A face '
                    'does more than anything else on this page.',
                    style:
                        TextStyle(color: A91.faint, fontSize: 12, height: 1.45),
                  ),
                  if (has) ...[
                    const SizedBox(height: 6),
                    GestureDetector(
                      onTap: _busy ? null : _choose,
                      child: const Text(
                        'Change',
                        style: TextStyle(
                            color: A91.grad2,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!,
              style: const TextStyle(color: A91.danger, fontSize: 12.5)),
        ],
      ],
    );
  }
}
