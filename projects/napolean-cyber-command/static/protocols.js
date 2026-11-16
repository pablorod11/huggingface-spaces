/* Original protocol study prompts. No traffic inspection or external service calls. */
(function (root, factory) {
  'use strict';
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.VeyraProtocols = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const topics = [
    {
      id: 'http',
      title: 'HTTP / HTTPS',
      explorerLesson: 'HTTP and HTTPS',
      summary: 'HTTP defines request and response semantics. HTTPS uses a secured connection for those exchanges.',
      boundary: 'Transport protection does not establish application authorization or safe handling of request data.',
      questions: [
        'Which methods and resources should each caller be allowed to use?',
        'Where should HTTPS begin and end, including intermediary connections?',
        'Which responses should be cacheable, and could they contain private data?'
      ],
      sources: [{label: 'RFC 9110 — HTTP Semantics', href: 'https://www.rfc-editor.org/rfc/rfc9110.html'}]
    },
    {
      id: 'tls',
      title: 'TLS',
      explorerLesson: 'TLS/SSL',
      summary: 'TLS 1.3 negotiates cryptographic parameters and protects application data in transit.',
      boundary: 'Peer identity checks depend on the authentication configuration; encryption alone does not grant application permissions.',
      questions: [
        'Which peer identities and trust anchors should the client accept?',
        'Where should TLS terminate, and which connections need separate protection?',
        'If early data is enabled, which operations must account for replay?'
      ],
      // Current TLS 1.3 specification: July 2026; obsoletes RFC 8446.
      sources: [{label: 'RFC 9846 — TLS 1.3', href: 'https://www.rfc-editor.org/rfc/rfc9846.html'}]
    },
    {
      id: 'dns',
      title: 'DNS',
      explorerLesson: 'DNS',
      summary: 'DNS resolves names using records, resolvers, authoritative servers, and caches.',
      boundary: 'Plain DNS does not authenticate answers. DNSSEC validation can authenticate signed DNS data; it does not provide confidentiality.',
      questions: [
        'Which resolver and authoritative sources should this environment trust?',
        'How should cached records and their lifetimes affect expected behavior?',
        'Is DNSSEC validation required, and how should validation failures be handled?'
      ],
      sources: [
        {label: 'RFC 1035 — DNS implementation and specification', href: 'https://www.rfc-editor.org/rfc/rfc1035.html'},
        {label: 'RFC 4033 — DNS security introduction and requirements', href: 'https://www.rfc-editor.org/rfc/rfc4033.html'}
      ]
    },
    {
      id: 'ssh',
      title: 'SSH',
      explorerLesson: 'SSH',
      summary: 'SSH separates protected transport, user authentication, and multiplexed connection channels.',
      boundary: 'Host authentication and user authentication are separate checks; an encrypted session does not determine which actions a user may perform.',
      questions: [
        'How should clients verify the server host key and handle key changes?',
        'Which user authentication methods and accounts should be permitted?',
        'Which shell, forwarding, and subsystem channels should each account use?'
      ],
      sources: [{label: 'RFC 4251 — SSH protocol architecture', href: 'https://www.rfc-editor.org/rfc/rfc4251.html'}]
    }
  ];

  function getTopic(id) {
    return topics.find(topic => topic.id === id) || null;
  }

  function draftExpected(existingString, id) {
    const topic = getTopic(id);
    if (!topic) throw new Error('Choose a known protocol topic before drafting.');
    if (typeof existingString !== 'string') throw new Error('Expected controls must be text.');
    if (existingString.length > 2000) throw new Error('Expected controls exceed the 2000 character limit.');
    const marker = `[Protocol study context: ${topic.id}]`;
    if (existingString.split(/\r?\n/).includes(marker)) return existingString;
    const context = [
      marker,
      'Study context only — not observations, evidence, or conclusions.',
      topic.title + ': ' + topic.summary,
      'Boundary: ' + topic.boundary,
      ...topic.questions.map(question => '- ' + question),
      'Primary references:',
      ...topic.sources.map(source => '- ' + source.label + ': ' + source.href)
    ].join('\n');
    const drafted = existingString + (existingString ? '\n\n' : '') + context;
    if (drafted.length > 2000) throw new Error('This draft would exceed 2000 characters. Shorten the existing text before adding study context.');
    return drafted;
  }

  return {topics, explorerUrl: 'https://protocol-explorer-alpha.vercel.app/', getTopic, draftExpected};
});
