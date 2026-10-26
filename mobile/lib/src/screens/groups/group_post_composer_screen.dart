import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/api_exception.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';
import '../listing/fields.dart';

/// Writing a photo post to a group.
///
/// Based on ComposerScreen (the Space one), photo-only: the web offers photos
/// only for groups, and the API's `video` kind has nothing here to match it.
///
/// The image goes to Storage the moment it is picked, not when *Post* is
/// pressed — same reasoning as the Space composer: it is the slow part, and
/// doing it at publish time would lose the caption with a failed upload.
class GroupPostComposerScreen extends ConsumerStatefulWidget {
  const GroupPostComposerScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<GroupPostComposerScreen> createState() =>
      _GroupPostComposerScreenState();
}

class _GroupPostComposerScreenState
    extends ConsumerState<GroupPostComposerScreen> {
  final _body = TextEditingController();

  File? _local;
  String? _imageUrl;

  bool _uploading = false;
  bool _posting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _body.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  bool get _ready => _imageUrl != null;

  Future<void> _pick(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked == null) return;

    setState(() {
      _local = File(picked.path);
      _imageUrl = null;
      _uploading = true;
      _error = null;
    });

    try {
      final url = await ref
          .read(groupsRepositoryProvider)
          .uploadImage(File(picked.path), groupId: widget.groupId);
      if (!mounted) return;
      setState(() => _imageUrl = url);
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
              leading: Icon(Icons.photo_camera_outlined, color: A91.muted),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: Icon(Icons.photo_library_outlined, color: A91.muted),
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
      await ref.read(groupsRepositoryProvider).addPost(
            widget.groupId,
            body: _body.text,
            imageUrl: _imageUrl!,
          );

      ref.invalidate(groupPostsProvider(widget.groupId));

      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text('Posted to your group.',
              style: TextStyle(color: A91.ink)),
        ),
      );
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
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
          children: [
            _photo(),
            const SizedBox(height: 22),
            Field(
              label: 'Say something about it',
              optional: true,
              child: TextField(
                controller: _body,
                minLines: 3,
                maxLines: 6,
                maxLength: 2000,
                textCapitalization: TextCapitalization.sentences,
                style: const TextStyle(fontSize: 14.5, height: 1.45),
                decoration: const InputDecoration(
                  hintText: 'Say something about it',
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
                  style: TextStyle(
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
            Text(
              "Only the families in this group see it, unless you choose to "
              "show it on your group's page.",
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
              ? SizedBox(
                  height: 24,
                  width: 24,
                  child: CircularProgressIndicator(
                      strokeWidth: 2.4, color: A91.faint),
                )
              : _local != null
                  ? null
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add_photo_alternate_outlined,
                            color: A91.faint, size: 30),
                        const SizedBox(height: 10),
                        Text('Take or choose a photo',
                            style: TextStyle(color: A91.faint, fontSize: 13.5)),
                      ],
                    ),
        ),
      );
}
