import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/thread.dart';
import '../../data/supabase.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/states.dart';

/// One conversation.
///
/// History comes from the API; new messages arrive over Realtime. They are
/// merged here rather than by refetching, so somebody else typing does not
/// cost a round trip — and a message sent from this device appears once, not
/// twice, because the insert and the broadcast carry the same id.
class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.thread});

  final Thread thread;

  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  final _draft = TextEditingController();
  final _scroll = ScrollController();

  /// Messages that arrived after the first load — sent here, or delivered.
  final _live = <String, Message>{};

  bool _sending = false;
  String? _error;

  ThreadKey get _key => ThreadKey(widget.thread.kind, widget.thread.threadId);

  @override
  void initState() {
    super.initState();
    _draft.addListener(() => setState(() {}));
    if (widget.thread.unread) _markRead();
  }

  /// Opening a conversation is what reads it.
  ///
  /// Failure is swallowed on purpose: the person is looking at the messages
  /// either way, and an error about a read receipt would be noise about
  /// something they did not ask for.
  Future<void> _markRead() async {
    try {
      await ref
          .read(threadsRepositoryProvider)
          .markRead(widget.thread.kind, widget.thread.threadId);
      if (!mounted) return;
      // The dot on this row and the badge on the tab both come from the inbox.
      ref.invalidate(inboxProvider);
    } on ApiException {
      // Ignored.
    }
  }

  @override
  void dispose() {
    _draft.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _remember(Message message) {
    // Keyed by id, so a message that arrives twice — once from the send, once
    // from the broadcast of the same row — lands once.
    if (_live.containsKey(message.id)) return;
    setState(() => _live[message.id] = message);
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send() async {
    final body = _draft.text.trim();
    if (body.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      final sent = await ref
          .read(threadsRepositoryProvider)
          .send(widget.thread.kind, widget.thread.threadId, body);
      _draft.clear();
      _remember(sent);
      // The inbox shows a preview and a timestamp, both of which just changed.
      ref.invalidate(inboxProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(messagesProvider(_key));
    final me = supabase.auth.currentUser?.id;

    // Deliveries land in _live; the provider is watched for its side effect
    // rather than its value, because the value is one message and the screen
    // wants all of them.
    ref.listen(incomingProvider(_key), (_, next) {
      final message = next.value;
      if (message != null) _remember(message);
    });

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.thread.title ?? 'Conversation',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            if (widget.thread.subtitle != null)
              Text(
                widget.thread.subtitle!,
                style: const TextStyle(fontSize: 11.5, color: A91.faint),
              ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: history.when(
                loading: () => const Loading(),
                error: (error, _) => ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading this conversation.',
                  onRetry: () => ref.invalidate(messagesProvider(_key)),
                ),
                data: (loaded) {
                  final all = [...loaded];
                  final seen = loaded.map((m) => m.id).toSet();
                  for (final m in _live.values) {
                    if (!seen.contains(m.id)) all.add(m);
                  }
                  all.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                  return ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    children: [
                      if (widget.thread.origin != null) ...[
                        _Origin(
                          origin: widget.thread.origin!,
                          iAmSeeker: widget.thread.iAmSeeker,
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (widget.thread.opening != null) ...[
                        _Opening(text: widget.thread.opening!),
                        const SizedBox(height: 14),
                      ],
                      for (final m in all)
                        _Bubble(message: m, mine: m.senderId == me),
                    ],
                  );
                },
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  _error!,
                  style: const TextStyle(color: A91.danger, fontSize: 13),
                ),
              ),
            _Composer(
              controller: _draft,
              sending: _sending,
              // A coach's approach stays closed until the family answers. The
              // check constraint on enquiries refuses a second message anyway;
              // this says why rather than letting somebody type into a field
              // that will reject them.
              blocked: widget.thread.awaitingReply && !widget.thread.iAmSeeker,
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }
}

/// Where this conversation came from, when it came from a request for a call.
///
/// A message from somebody you never wrote to is what makes contact feel
/// unsolicited, so the parent is told which of their own requests produced it
/// — and the coach is reminded why they are allowed to be writing.
///
/// A rule rather than a card: it is not part of the conversation, it is the
/// reason there is one.
class _Origin extends StatelessWidget {
  const _Origin({required this.origin, required this.iAmSeeker});

  final QueryOrigin origin;
  final bool iAmSeeker;

  /// "3 Sept" — the web's wording, which this deliberately matches.
  static String _onDate(DateTime at) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${at.day} ${months[at.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final who = iAmSeeker ? 'You asked' : 'They asked';
    final about =
        origin.serviceName == null ? '' : ' about ${origin.serviceName}';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Expanded(child: Divider(color: A91.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            '$who for a call$about on ${_onDate(origin.askedAt)}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: A91.faint, fontSize: 11.5),
          ),
        ),
        const Expanded(child: Divider(color: A91.border)),
      ],
    );
  }
}

/// The message that started it, set apart from the conversation proper.
class _Opening extends StatelessWidget {
  const _Opening({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: A91.borderSoft),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'HOW THIS STARTED',
              style: TextStyle(
                color: A91.faint,
                fontSize: 10,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 7),
            Text(text, style: const TextStyle(color: A91.muted, height: 1.5)),
          ],
        ),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine});

  final Message message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final time = TimeOfDay.fromDateTime(message.createdAt);

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints:
            BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.76),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        decoration: BoxDecoration(
          // Mine is lifted, theirs sits on the ground. The gradient is not
          // used here: it belongs to primary actions, and a message is not one.
          color: mine ? A91.surface3 : A91.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: Border.all(color: A91.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              message.body,
              style:
                  const TextStyle(color: A91.ink, height: 1.45, fontSize: 14.5),
            ),
            const SizedBox(height: 3),
            Text(
              '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
              style: const TextStyle(color: A91.faint, fontSize: 10.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.blocked,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final bool blocked;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    if (blocked) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: A91.border)),
        ),
        child: const Text(
          'One message until they answer. You will be able to write again once '
          'they do.',
          textAlign: TextAlign.center,
          style: TextStyle(color: A91.faint, fontSize: 13, height: 1.5),
        ),
      );
    }

    final canSend = controller.text.trim().isNotEmpty && !sending;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: A91.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 5,
              maxLength: 4000,
              enabled: !sending,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Message',
                counterText: '',
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: canSend ? onSend : null,
            style: IconButton.styleFrom(
              backgroundColor: canSend ? A91.grad1 : A91.surface2,
              foregroundColor: canSend ? A91.onAccent : A91.faint,
              padding: const EdgeInsets.all(12),
            ),
            icon: sending
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(A91.faint),
                    ),
                  )
                : const Icon(Icons.arrow_upward, size: 20),
          ),
        ],
      ),
    );
  }
}
