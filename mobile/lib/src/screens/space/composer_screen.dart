import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/api_exception.dart';
import '../../data/models/space.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';
import '../listing/fields.dart';

/// Writing a post.
///
/// A screen rather than a sheet: a photo, a caption and a preview do not fit
/// above a keyboard, and this is the one place where mobile genuinely beats
/// the web — the camera is in the same hand as the app.
///
/// The image goes to Storage when the coach picks it, not when they publish.
/// Same reasoning as the listing photo: it is the slow part, and doing it at
/// publish time means a failed upload loses the caption with it.
class ComposerScreen extends ConsumerStatefulWidget {
  const ComposerScreen({super.key, required this.space});

  final Space space;

  @override
  ConsumerState<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends ConsumerState<ComposerScreen> {
  String _kind = 'photo';
  final _body = TextEditingController();
  final _videoUrl = TextEditingController();

  File? _local;
  String? _imageUrl;

  bool _uploading = false;
  bool _posting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _body.addListener(() => setState(() {}));
    _videoUrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _body.dispose();
    _videoUrl.dispose();
    super.dispose();
  }

  String? get _youtubeId => parseYouTubeId(_videoUrl.text);

  bool get _ready => _kind == 'photo' ? _imageUrl != null : _youtubeId != null;

  Future<void> _pick(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      // Well inside the 5 MB ceiling, and nobody is looking at a Space post
      // at more than phone width anyway.
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked == null) return;

    setState(() {
      _uploading = true;
      _error = null;
    });

    try {
      final url = await ref
          .read(spacesRepositoryProvider)
          .uploadImage(File(picked.path), spaceId: widget.space.id);
      if (!mounted) return;
      setState(() {
        _local = File(picked.path);
        _imageUrl = url;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
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

  Future<void> _publish() async {
    if (!_ready || _posting) return;

    setState(() {
      _posting = true;
      _error = null;
    });

    try {
      await ref.read(spacesRepositoryProvider).createPost(
            widget.space.providerId,
            kind: _kind,
            body: _body.text,
            imageUrl: _kind == 'photo' ? _imageUrl : null,
            youtubeId: _kind == 'video' ? _youtubeId : null,
          );

      // The post count on the header comes from the Space itself, so both.
      ref.invalidate(mySpacePostsProvider);
      ref.invalidate(mySpaceProvider);

      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New post')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          children: [
            const Eyebrow('What are you posting'),
            const SizedBox(height: 12),
            ChipWrap(
              children: [
                ToggleChip(
                  label: 'A photo',
                  selected: _kind == 'photo',
                  onTap: () => setState(() => _kind = 'photo'),
                ),
                ToggleChip(
                  label: 'A video',
                  selected: _kind == 'video',
                  onTap: () => setState(() => _kind = 'video'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            if (_kind == 'photo') _photo() else _video(),
            const SizedBox(height: 22),
            Field(
              label: 'Say something about it',
              optional: true,
              // Bound straight to the controller rather than through
              // TextInput: this screen already owns one for the caption, and
              // two controllers on one field fight over the cursor.
              child: TextField(
                controller: _body,
                minLines: 3,
                maxLines: 6,
                maxLength: 4000,
                textCapitalization: TextCapitalization.sentences,
                style: const TextStyle(fontSize: 14.5, height: 1.45),
                decoration: const InputDecoration(
                  hintText:
                      'What the drill is, who is in it, what they worked on.',
                  counterText: '',
                  isDense: true,
                ),
              ),
            ),
            if (_error != null) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: const TextStyle(
                      color: A91.danger, fontSize: 13.5, height: 1.5),
                ),
              ),
            ],
            PrimaryButton(
              label: 'Post',
              busy: _posting,
              onPressed: _ready && !_uploading ? _publish : null,
            ),
            const SizedBox(height: 12),
            const Text(
              'Anyone who opens your Space can see this. Do not post another '
              "family's child without asking them first.",
              textAlign: TextAlign.center,
              style: TextStyle(color: A91.faint, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _photo() => GestureDetector(
        onTap: _uploading ? null : _choose,
        child: Container(
          height: 260,
          decoration: BoxDecoration(
            color: A91.surface2,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: A91.border),
            image: _local == null
                ? null
                : DecorationImage(image: FileImage(_local!), fit: BoxFit.cover),
          ),
          alignment: Alignment.center,
          child: _uploading
              ? const SizedBox(
                  height: 24,
                  width: 24,
                  child: CircularProgressIndicator(
                      strokeWidth: 2.4, color: A91.faint),
                )
              : _local != null
                  ? null
                  : const Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add_photo_alternate_outlined,
                            color: A91.faint, size: 30),
                        SizedBox(height: 10),
                        Text('Take or choose a photo',
                            style: TextStyle(color: A91.faint, fontSize: 13.5)),
                      ],
                    ),
        ),
      );

  Widget _video() {
    final id = _youtubeId;
    final typed = _videoUrl.text.trim().isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Field(
          label: 'Paste the YouTube link',
          hint: 'The video stays on YouTube. Aspire91 shows it on your Space.',
          child: TextField(
            controller: _videoUrl,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(
              hintText: 'https://youtu.be/…',
              isDense: true,
            ),
          ),
        ),
        if (typed && id == null)
          const Text(
            "That doesn't look like a YouTube link. Paste the link from the "
            'video itself.',
            style: TextStyle(color: A91.danger, fontSize: 12.5, height: 1.45),
          ),
        if (id != null)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: A91.tealSoft,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: A91.teal.withValues(alpha: 0.32)),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline,
                    color: A91.teal, size: 19),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Video found — $id',
                    style: const TextStyle(color: A91.teal, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
